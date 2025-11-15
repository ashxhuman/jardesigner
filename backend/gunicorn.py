import multiprocessing
# This is the executable to run Gunicorn, a production-grade Python WSGI HTTP server.
# Gunicorn can serve Flask app and handle multiple workers.

bind = "0.0.0.0:5000"             # flask-socketio port number
worker_class = "gevent"           # Required for WebSocket support
workers = 1                       # SocketIO recommends 1 worker per node (scale with Redis later)
timeout = 120

# Logging
loglevel = "info"
errorlog = "/app/logs/error.log"
accesslog = "/app/logs/access.log"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'