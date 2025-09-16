# import asyncio
# import json
# from fastapi import FastAPI, Query, HTTPException, UploadFile, File
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import JSONResponse
# import httpx
# from pydantic import BaseModel
# from enum import Enum
# from pathlib import Path
# import shutil
# import os

# app = FastAPI()

# # CORS configuration
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:3000"],  # React dev server
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# base_url = "https://neuromorpho.org/api/neuron/"

# MEDIA_ROOT = os.environ.get("MEDIA_ROOT", "media")

# @app.get("/neuromorpho/")
# async def neuromorpho():
#     try:
#         async with httpx.AsyncClient() as client:
#             response = await client.get("https://neuromorpho.org/api/neuron/fields/species")
#             if response.status_code == 200:
#                 response = response.json()["fields"]
#                 response = sorted(response)
#                 data = {"species": list(response)}
#                 return data
#     except Exception as e:
#         print(f"Error in /neuromorpho/: {e}")
#         return JSONResponse(status_code=500, content={"error": "Failed to fetch species"})
#     return -1


# import time


# @app.patch("/neuromorpho/")
# async def neuromorpho_metadata(species: str):
#     species = species.lower()
#     start = time.time()

#     limits = httpx.Limits(max_connections=10, max_keepalive_connections=5)
#     semaphore = asyncio.Semaphore(10)

#     async with httpx.AsyncClient(timeout=40.0, limits=limits) as client:

#         # get total number of pages of element
#         response = await client.get(f'{base_url}/select?q=species:{species}')
#         data = response.json()
#         total_pages = data.get("page", {}).get("totalPages", 1)

#         brain_regions = set()
#         cell_types = set()
#         archives = set()

#         """
#             Fetch all the pages using semaphores and limit concurrency.
#             total size per request: 500
#         """

#         async def fetch_page(page):
#             async with semaphore:
#                 try:
#                     resp = await client.get(
#                         f'{base_url}/select?q=species:{species}&size=500&page={page}'
#                     )
#                     return resp
#                 except Exception as e:
#                     print(f"Error fetching page {page}: {e}")
#                     return None

#         tasks = [fetch_page(page) for page in range(total_pages)]
#         responses = await asyncio.gather(*tasks)

#         for resp in responses:
#             if resp is None:
#                 continue
#             print(f'Response: {resp.json()}')
#             neurons = resp.json().get("_embedded", {}).get("neuronResources", [])
#             for neuron in neurons:
#                 if neuron.get("brain_region"):
#                     if isinstance(neuron["brain_region"], list):
#                         brain_regions.update(neuron["brain_region"])
#                     else:
#                         brain_regions.add(neuron["brain_region"])
#                 if neuron.get("cell_type"):
#                     if isinstance(neuron["cell_type"], list):
#                         cell_types.update(neuron["cell_type"])
#                     else:
#                         cell_types.add(neuron["cell_type"])
#                 if neuron.get("archive"):
#                     if isinstance(neuron["archive"], list):
#                         archives.update(neuron["archive"])
#                     else:
#                         archives.add(neuron["archive"])

#     end = time.time()
#     print("Time taken", end - start, "second")
#     data = {
#         "species": species,
#         "brain_region": list(brain_regions),
#         "cell_type": list(cell_types),
#         "archive": list(archives),
#     }
#     return data

# class Items(BaseModel):
#     species: str | None = None
#     brain_region: str | None = None
#     cell_type: str | None = None
#     archive: str | None = None


# @app.post("/neuromorpho/submit")
# async def item(request: Items):
#     try:
#         field = request.model_dump()
#         filter_queries = []
#         filter_fields = {
#             "species": field.get("species"),
#             "brain_region": field.get("brain_region"),
#             "cell_type": field.get("cell_type"),
#             "archive": field.get("archive"),
#             "page": field.get("page")
#         }

#         # Build the query parameters as a list of tuples
#         query_params = []
#         main_q = None
#         main_q_key = None
#         for key in ["species", "brain_region", "cell_type", "archive"]:
#             value = filter_fields.get(key)
#             if value and str(value).strip().lower() not in ["", "none"]:
#                 main_q = f'{key}:"{value}"'
#                 main_q_key = key
#                 break

#         if main_q:
#             query_params.append(("q", main_q))

#         for key in ["species", "brain_region", "cell_type", "archive"]:
#             value = filter_fields.get(key)
#             if value and str(value).strip().lower() not in ["", "none"] and key != main_q_key:
#                 filter_queries.append(f'{key}:"{value}"')

#         # Add page as a filter query if present
#         if filter_fields.get("page"):
#             filter_queries.append(f'page:{filter_fields["page"]}')
#         for fq in filter_queries:
#             query_params.append(("fq", fq))
#         print(f"Query params sent to external API: {query_params}")
#         async with httpx.AsyncClient() as client:
#             response = await client.get(f"{base_url}/select", params=query_params)

#         print(f'Final URL: {response.url}')

#         if response.status_code == 200:
#             response_json = response.json()
#             page_info = response_json.get("page", {})
#             neuron_data = response_json.get("_embedded", {}).get("neuronResources", [])

#             current_page = page_info.get("number", 0)
#             total_pages = page_info.get("totalPages", 0)

#             data = {
#                 "neuron_data": neuron_data,
#                 "neuronPage": page_info,
#                 "page": current_page,
#                 "totalPages": total_pages,
#                 "currentPage": current_page,
#                 "hasNextPage": current_page < total_pages - 1,
#                 "hasPreviousPage": current_page > 0,
#             }
#             return data
#         else:
#             print(f"Error: Received status code {response.status_code}")
#             raise HTTPException(
#                 status_code=response.status_code,
#                 detail=f"API request failed with status {response.status_code}"
#             )

#     except HTTPException:
#         raise
#     except Exception as e:
#         print(f"Error in neuromorpho submit: {e}")
#         raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# from pathlib import Path
# import uuid


# def save_swc_file(uploaded_file, save_dir, source_id):
#     """Save uploaded SWC file to directory"""
#     # Create directory if needed
#     save_dir = Path(save_dir)
#     save_dir.mkdir(exist_ok=True, parents=True)

#     # Generate unique filename
#     filename = f"{source_id}"
#     if not filename.lower().endswith(".swc"):
#         filename += ".swc"

#     # Save the file
#     file_path = save_dir / filename
#     with open(file_path, "a+b") as destination:
#         for chunk in uploaded_file.chunks():
#             destination.write(chunk)

#     return file_path

# @app.post("/save_cart/")
# async def save_cart(file: UploadFile = File(...)):
#     try:
#         source_id = "neuromorpho_swc"
#         save_dir = Path(MEDIA_ROOT) / f"{source_id}"
#         file_path = save_swc_file(file, save_dir, source_id)
#         return JSONResponse({"success": "success", "file_path": file_path}, status_code=200)
#     except Exception as e:
#         return JSONResponse({"error": str(e)}, status_code=500)
