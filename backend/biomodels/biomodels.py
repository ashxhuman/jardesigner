##############################################
# biomodels.py — BioModels.org REST API client
#
# Curated/non-curated chemical (SBML) model search, detail lookup, and
# staging into a user's session directory for chemProto ingestion.
##############################################
import json
import traceback
from pathlib import Path

import requests

BASE_URL = "https://www.biomodels.org"
_HEADERS = {"User-Agent": "jardesigner/1.0"}

_USER_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "user_uploads"


# ── Public API ────────────────────────────────────────────────────────────────

def search_models(query: str, offset: int = 0, size: int = 20, sort: str = "relevance-score") -> dict:
    """Full-text search over BioModels. Returns {"models": [...raw hits...], "total": N}."""
    params = {
        "query": query,
        "offset": offset,
        "numResults": size,
        "sort": sort,
        "format": "json",
    }
    resp = requests.get(f"{BASE_URL}/search", params=params, headers=_HEADERS, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    return {"models": data.get("models", []), "total": data.get("matches", 0)}


def get_model_info(model_id: str) -> dict:
    """Full model metadata: name, format, publication, files (main/additional), etc."""
    resp = requests.get(f"{BASE_URL}/{model_id}", params={"format": "json"}, headers=_HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def model_to_item(model: dict) -> dict:
    """Map a raw /search hit to the ProtoPicker item schema."""
    model_id = model["id"]
    year = (model.get("submissionDate") or "")[:4]
    description = ' '.join(filter(None, [
        model.get("format", ""),
        f"({year})" if year else "",
        f"— {model['submitter']}" if model.get("submitter") else "",
    ]))
    return {
        'id':          f'bm_{model_id}',
        'name':        model.get('name', model_id),
        'source':      'BioModels',
        'description': description,
        'source_type': 'sbml',
        'server_file': f'{model_id}_url.xml',
        'model_id':    model_id,
    }


def get_model_detail(model_id: str) -> dict:
    """Model detail preview — sourced live from the BioModels REST API."""
    try:
        info = get_model_info(model_id)
    except Exception:
        traceback.print_exc()
        return {'fields': [{'label': 'BioModels ID', 'value': model_id}]}

    fmt = info.get('format') or {}
    fields = [
        {'label': 'BioModels ID', 'value': model_id},
        {'label': 'Format',       'value': ' '.join(filter(None, [fmt.get('name', ''), fmt.get('version', '')]))},
    ]
    if info.get('curationStatus'):
        fields.append({'label': 'Curation', 'value': info['curationStatus'].title()})

    approach = (info.get('modellingApproach') or {}).get('name')
    if approach:
        fields.append({'label': 'Modelling Approach', 'value': approach})

    organism = next(
        (a['name'] for a in info.get('modelLevelAnnotations', [])
         if a.get('resource') == 'Taxonomy' and a.get('name')),
        None,
    )
    if organism:
        fields.append({'label': 'Organism', 'value': organism})

    result = {'fields': fields}

    diagram = next(
        (f['name'] for f in (info.get('files') or {}).get('additional', [])
         if f.get('name', '').lower().endswith('.png') and f['name'].lower() != 'curation_image.png'),
        None,
    )
    if diagram:
        result['image_url'] = f'{BASE_URL}/model/download/{model_id}?filename={diagram}'

    pub = info.get('publication') or {}
    if pub:
        authors = ', '.join(a['name'] for a in pub.get('authors', []) if a.get('name'))
        ref_text = ' '.join(filter(None, [
            authors,
            f"({pub['year']})" if pub.get('year') else None,
            pub.get('title', ''),
            pub.get('journal', ''),
        ]))
        if ref_text:
            entry = {'text': ref_text}
            accession = pub.get('accession')
            if accession and pub.get('type') == 'PubMed ID':
                entry['pmid'] = accession
                entry['url'] = f'https://pubmed.ncbi.nlm.nih.gov/{accession}/'
            result['references'] = [entry]

    return result


def stage_model(model_id: str, client_id: str) -> dict:
    dest_dir = _USER_UPLOADS_DIR / client_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    info = get_model_info(model_id)
    main_files = (info.get('files') or {}).get('main') or []
    if not main_files:
        raise ValueError(f'No SBML file found for BioModels {model_id}')
    remote_filename = main_files[0]['name']
    mime_type = (main_files[0].get('mimeType') or '').lower()
    if 'xml' not in mime_type and not remote_filename.lower().endswith(('.xml', '.sbml')):
        raise ValueError(
            f"BioModels {model_id}'s main file ({remote_filename}, {mime_type or 'unknown type'}) "
            "isn't a single SBML file — this entry likely bundles multiple models "
            "(e.g. a genome-scale model collection) and isn't supported here."
        )

    resp = requests.get(
        f'{BASE_URL}/model/download/{model_id}',
        params={'filename': remote_filename},
        headers=_HEADERS,
        timeout=30,
    )
    resp.raise_for_status()

    local_filename = f'{model_id}.xml'
    (dest_dir / local_filename).write_bytes(resp.content)

    item = {
        'id':          f'bm_{model_id}',
        'name':        info.get('name', model_id),
        'source':      'BioModels',
        'description': info.get('name', model_id),
        'source_type': 'sbml',
        'server_file': local_filename,
        'model_id':    model_id,
        'details':     get_model_detail(model_id),
    }

    path = dest_dir / "user_registry.json"
    try:
        registry = json.loads(path.read_text())
    except FileNotFoundError:
        registry = {}
    except json.JSONDecodeError:
        print(f"[BioModels] WARNING: {path} is corrupt — resetting")
        registry = {}
    registry.setdefault("morpho", {"items": []})
    registry.setdefault("chan",   {"items": []})
    section    = registry.setdefault("chem", {"items": []})
    items_list = section.setdefault("items", [])
    for i, existing in enumerate(items_list):
        if existing.get("id") == item["id"]:
            items_list[i] = item
            break
    else:
        items_list.append(item)
    path.write_text(json.dumps(registry, indent=2))
    print(f"[BioModels] Saved model {item['id']} to {path}")

    return {'filename': local_filename}
