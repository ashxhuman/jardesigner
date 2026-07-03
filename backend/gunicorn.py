bind = "0.0.0.0:5000"
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"
workers = 1                  # SocketIO requires 1 worker (scale with Redis later)
timeout = 120
loglevel = "info"
errorlog = "/app/logs/error.log"
accesslog = "/app/logs/access.log"
