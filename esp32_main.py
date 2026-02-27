import network
import socket
from machine import Pin

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
SSID = "YOUR_WIFI_SSID"        # <--- Change this
PASSWORD = "YOUR_WIFI_PASSWORD"  # <--- Change this
LED_PIN = 2                    # Onboard LED for most ESP32s is 2

led = Pin(LED_PIN, Pin.OUT)

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print('Connecting to WiFi...')
        wlan.connect(SSID, PASSWORD)
        while not wlan.isconnected():
            pass
    print('Connection successful!')
    print('ESP32 IP Address:', wlan.ifconfig()[0])
    return wlan.ifconfig()[0]

def start_server():
    ip = connect_wifi()
    addr = socket.getaddrinfo('0.0.0.0', 80)[0][-1]
    
    s = socket.socket()
    s.bind(addr)
    s.listen(1)
    print('Listening on', addr)

    while True:
        cl, addr = s.accept()
        print('Client connected from', addr)
        request = cl.recv(1024)
        request = str(request)
        
        if '/on' in request:
            led.value(1)
            print("LED ON")
        elif '/off' in request:
            led.value(0)
            print("LED OFF")
            
        response = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nOK"
        cl.send(response)
        cl.close()

# Start the server
try:
    start_server()
except Exception as e:
    print("Error:", e)
    led.value(0)
