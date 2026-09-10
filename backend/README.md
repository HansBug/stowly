# Stowly backend

Local HTTP service the Electron shell starts on a random loopback port. It turns a Stowly project into a `packingsolver3d` instance, runs the solve in a worker thread, serves the built-in container and item presets, and imports the common cargo-list formats (project JSON, CSV/XLSX cargo lists, ESICUP `thpack`/BR text, PackingSolver CSV pairs).

```shell
pip install -e ".[test]"
python -m stowly_backend --port 0 --token dev      # prints one READY line with the port
pytest --cov
```
