try:
    import app
    # List all routes
    routes = sorted([str(r) for r in app.app.url_map.iter_rules()])
    print("Total routes:", len(routes))
    for route in routes:
        if 'camera' in route:
            print(route)
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
