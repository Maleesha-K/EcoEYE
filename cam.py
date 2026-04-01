#!/usr/bin/env python3
"""
Network Scanner - Discover all devices on your local network
Useful for finding IP cameras and other connected devices.

Requirements:
    pip install scapy netifaces
    
    On Linux/Mac, run with sudo for ARP scanning:
    sudo python3 network_scanner.py
    
    On Windows, run as Administrator.
"""

import socket
import subprocess
import sys
import ipaddress
import concurrent.futures
from datetime import datetime

# Try importing optional but preferred libraries
try:
    import netifaces
    HAS_NETIFACES = True
except ImportError:
    HAS_NETIFACES = False

try:
    from scapy.all import ARP, Ether, srp
    HAS_SCAPY = True
except ImportError:
    HAS_SCAPY = False


# ─────────────────────────────────────────────
# 1. Detect local network range automatically
# ─────────────────────────────────────────────

def get_local_network():
    """Detect the local subnet (e.g., 192.168.1.0/24)."""
    if HAS_NETIFACES:
        for iface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(iface)
            if netifaces.AF_INET in addrs:
                for addr in addrs[netifaces.AF_INET]:
                    ip = addr.get('addr', '')
                    netmask = addr.get('netmask', '')
                    if ip and not ip.startswith('127.'):
                        network = ipaddress.IPv4Network(f"{ip}/{netmask}", strict=False)
                        return str(network)

    # Fallback: use socket to find local IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        # Assume /24 subnet
        base = '.'.join(local_ip.split('.')[:3]) + '.0/24'
        return base
    except Exception:
        return "192.168.1.0/24"


# ─────────────────────────────────────────────
# 2. ARP Scan (fastest, most reliable - needs root)
# ─────────────────────────────────────────────

def arp_scan(network_range):
    """Use ARP to discover all live hosts. Requires scapy + root/admin."""
    print(f"\n[ARP Scan] Scanning {network_range} ...")
    devices = []
    try:
        arp_request = ARP(pdst=network_range)
        broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
        packet = broadcast / arp_request
        answered, _ = srp(packet, timeout=3, verbose=False)

        for sent, received in answered:
            devices.append({
                "ip": received.psrc,
                "mac": received.hwsrc,
                "method": "ARP"
            })
    except Exception as e:
        print(f"  [!] ARP scan error: {e}")
    return devices


# ─────────────────────────────────────────────
# 3. Ping Sweep (fallback, no root needed)
# ─────────────────────────────────────────────

def ping_host(ip):
    """Ping a single IP. Returns IP if alive, else None."""
    ip = str(ip)
    try:
        if sys.platform == "win32":
            cmd = ["ping", "-n", "1", "-w", "300", ip]
        else:
            cmd = ["ping", "-c", "1", "-W", "1", ip]

        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode == 0:
            return ip
    except Exception:
        pass
    return None


def ping_sweep(network_range):
    """Ping all hosts in the subnet concurrently."""
    print(f"\n[Ping Sweep] Scanning {network_range} ...")
    network = ipaddress.IPv4Network(network_range, strict=False)
    hosts = list(network.hosts())

    live_hosts = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = {executor.submit(ping_host, ip): ip for ip in hosts}
        done = 0
        for future in concurrent.futures.as_completed(futures):
            done += 1
            result = future.result()
            if result:
                live_hosts.append({"ip": result, "mac": "N/A", "method": "Ping"})
            # Progress indicator
            print(f"  Progress: {done}/{len(hosts)}", end='\r')

    print()  # newline after progress
    return live_hosts


# ─────────────────────────────────────────────
# 4. Resolve hostnames
# ─────────────────────────────────────────────

def resolve_hostname(ip):
    """Try to get a hostname for an IP."""
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return "Unknown"


# ─────────────────────────────────────────────
# 5. Check common camera ports
# ─────────────────────────────────────────────

CAMERA_PORTS = {
    80:   "HTTP (web UI)",
    443:  "HTTPS (web UI)",
    554:  "RTSP (live stream)",
    8080: "HTTP alt (web UI)",
    8554: "RTSP alt",
    37777: "Dahua TCP",
    34567: "Generic DVR",
    9000:  "Hikvision SDK",
}

def check_port(ip, port, timeout=0.5):
    """Check if a port is open."""
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except Exception:
        return False


def detect_camera_ports(ip):
    """Check which camera-related ports are open on a host."""
    open_ports = []
    for port, label in CAMERA_PORTS.items():
        if check_port(ip, port):
            open_ports.append(f"{port} ({label})")
    return open_ports


# ─────────────────────────────────────────────
# 6. Main
# ─────────────────────────────────────────────

def main():
    print("=" * 60)
    print("   📡 Network Device Scanner")
    print(f"   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Auto-detect subnet
    network_range = get_local_network()
    print(f"\n[*] Detected local network: {network_range}")

    # Choose scan method
    devices = []
    if HAS_SCAPY:
        devices = arp_scan(network_range)
        if not devices:
            print("  [!] ARP returned no results. Falling back to ping sweep...")
            devices = ping_sweep(network_range)
    else:
        print("\n[!] 'scapy' not installed. Using ping sweep (slower).")
        print("    Install scapy for faster ARP scanning: pip install scapy")
        devices = ping_sweep(network_range)

    if not devices:
        print("\n[!] No devices found. Try running with sudo/Administrator.")
        return

    # Enrich results
    print(f"\n[*] Found {len(devices)} device(s). Resolving hostnames & checking camera ports...\n")
    print("-" * 60)
    print(f"{'IP Address':<18} {'MAC Address':<20} {'Hostname':<30}")
    print(f"{'Camera Ports'}")
    print("-" * 60)

    camera_candidates = []

    for device in sorted(devices, key=lambda x: ipaddress.IPv4Address(x["ip"])):
        ip = device["ip"]
        mac = device["mac"]
        hostname = resolve_hostname(ip)
        open_ports = detect_camera_ports(ip)

        print(f"{ip:<18} {mac:<20} {hostname:<30}")
        if open_ports:
            print(f"  📷 Camera ports: {', '.join(open_ports)}")
            camera_candidates.append(ip)
        print()

    # Summary
    print("=" * 60)
    print(f"  Total devices found : {len(devices)}")
    print(f"  Camera candidates   : {len(camera_candidates)}")
    if camera_candidates:
        print("\n  🎥 Likely cameras:")
        for ip in camera_candidates:
            print(f"     → {ip}")
    print("=" * 60)


if __name__ == "__main__":
    main()