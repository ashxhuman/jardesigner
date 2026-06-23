##############################################
# extensions.py — shared async bridge
#
# Runs a persistent asyncio event loop in a real OS thread (obtained via
# gevent's get_original so monkey-patching doesn't turn it into a greenlet).
# Flask route handlers call run_async(coro) to submit httpx coroutines and
# block cooperatively via a gevent Event until the result is ready.
##############################################
import asyncio

from gevent.monkey import get_original as _gevent_get_original
import gevent.event

_NativeThread = _gevent_get_original('threading', 'Thread')
_async_loop   = asyncio.new_event_loop()


def _run_loop():
    asyncio.set_event_loop(_async_loop)
    _async_loop.run_forever()


_NativeThread(target=_run_loop, daemon=True, name='async_db').start()


def run_async(coro):
    """Submit *coro* to the background asyncio loop and block the calling
    gevent greenlet cooperatively until done."""
    future = asyncio.run_coroutine_threadsafe(coro, _async_loop)
    done   = gevent.event.Event()
    future.add_done_callback(
        lambda _: gevent.get_hub().loop.run_callback(done.set)
    )
    done.wait()
    return future.result()
