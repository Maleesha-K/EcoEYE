import socket
import json

def dispatch_to_device_mock(device, payload):
    protocol = str(device.get("protocol", "socket-udp"))
    target = str(device.get("target", "")).strip()

    if protocol == "socket-udp":
        host_ip, port_str = target.split(":", 1)
        host_port = int(port_str)
        
        if isinstance(payload, str) and payload.startswith("0x"):
            hex_data = payload[2:]
            if len(hex_data) % 2 != 0:
                hex_data = "0" + hex_data
            data_to_send = bytes.fromhex(hex_data)
        elif isinstance(payload, (dict, list)):
            data_to_send = json.dumps(payload).encode("utf-8")
        else:
            data_to_send = str(payload).encode("utf-8")

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(data_to_send, (host_ip, host_port))
        sock.close()
        return True
    return False

# Test
device = {"protocol": "socket-udp", "target": "127.0.0.1:4210"}
payload_on = "0x15"
payload_off = "0x14"

print("Sending ON signal...")
dispatch_to_device_mock(device, payload_on)
print("Sending OFF signal...")
dispatch_to_device_mock(device, payload_off)
