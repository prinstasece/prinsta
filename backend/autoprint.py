"""
Printsta - Automatic Print Script for Copier Center PC
This Python script runs on the Windows PC connected to the physical printer.
It logs in as the administrator, polls the Printsta server for active orders
with "printing" status, downloads the files, prints them automatically using
the default Windows printer, and marks them as "ready" on the server.

Requirements:
    pip install requests
"""

import os
import sys
import time
import requests
import subprocess
from pathlib import Path

# Server URL Configuration
API_BASE = "http://localhost:3000"

# Admin Credentials
ADMIN_USER = "admin"
ADMIN_PASS = "sece@print"

# Directory to temporarily save downloaded files for printing
PRINT_TEMP_DIR = Path("./temp_print_jobs")
PRINT_TEMP_DIR.mkdir(exist_ok=True)

# Session persistence
session = requests.Session()
token = ""

def login_as_admin():
    """Authenticates with the backend server and retrieves the JWT token."""
    global token
    print(f"Connecting to Printsta server at {API_BASE}...")
    try:
        url = f"{API_BASE}/auth/admin/login"
        payload = {"username": ADMIN_USER, "password": ADMIN_PASS}
        response = session.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                token = data.get("token")
                session.headers.update({"Authorization": f"Bearer {token}"})
                print("Successfully authenticated as Admin!")
                return True
        print(f"Login failed: {response.text}")
        return False
    except Exception as e:
        print(f"Error connecting to server for login: {e}")
        return False

def get_active_orders():
    """Fetches paid and active print queue from the server."""
    url = f"{API_BASE}/orders"
    try:
        response = session.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                return data.get("orders", [])
        elif response.status_code == 401 or response.status_code == 403:
            print("Session expired. Attempting re-login...")
            if login_as_admin():
                return get_active_orders()
    except Exception as e:
        print(f"Error fetching active orders: {e}")
    return []

def download_file(file_path_on_server, local_save_name):
    """Downloads the document from the server uploads directory."""
    # Extract relative filename from server path
    basename = os.path.basename(file_path_on_server)
    url = f"{API_BASE}/uploads/{basename}"
    local_path = PRINT_TEMP_DIR / local_save_name
    
    try:
        response = session.get(url, stream=True, timeout=15)
        if response.status_code == 200:
            with open(local_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            return local_path
        else:
            print(f"Failed to download file: HTTP {response.status_code}")
    except Exception as e:
        print(f"Error downloading file: {e}")
    return None

def print_file_windows(file_path, options=None):
    """Sends the file to the default system printer on Windows with customized configuration."""
    absolute_path = os.path.abspath(file_path)
    print(f"Sending {absolute_path} to printer with options: {options}")

    if options is None:
        options = {}

    color_mode = options.get("colorMode", "bw")
    sides = options.get("sides", "single")
    copies = int(options.get("copies", 1))

    # Configure printer via PowerShell Set-PrintConfiguration on default printer
    color_val = "$true" if color_mode == "color" else "$false"
    duplex_val = "OneSided" if sides == "single" else "TwoSidedLongEdge"

    try:
        # Get default printer name
        get_printer_cmd = [
            "powershell",
            "-Command",
            "(Get-PrintPrinter | Where-Object {$_.IsDefault -eq $true}).Name"
        ]
        printer_name = subprocess.check_output(get_printer_cmd, text=True).strip()
        print(f"Found default printer: {printer_name}")

        if printer_name:
            # Set print configuration
            set_config_cmd = [
                "powershell",
                "-Command",
                f"Set-PrintConfiguration -PrinterName '{printer_name}' -Color {color_val} -DuplexingMode {duplex_val}"
            ]
            subprocess.run(set_config_cmd, check=True)
            print("Successfully updated printer configuration.")
    except Exception as e:
        print(f"Warning: Could not configure printer properties: {e}")

    try:
        # Spool printing copies
        for c in range(copies):
            print(f"Printing copy {c + 1} of {copies}...")
            # Use Start-Process with Verb Print and get the process back to close it automatically after 5 seconds
            print_cmd = [
                "powershell",
                "-Command",
                f"$p = Start-Process -FilePath '{absolute_path}' -Verb Print -PassThru; Start-Sleep -Seconds 5; Stop-Process -Id $p.Id -Force"
            ]
            subprocess.run(print_cmd)
        
        return True
    except Exception as e:
        print(f"Failed to print file: {e}")
        return False

def mark_order_ready(order_id):
    """Updates order status to 'ready' on the server."""
    url = f"{API_BASE}/orders/{order_id}/status"
    try:
        response = session.patch(url, json={"status": "ready"}, timeout=10)
        if response.status_code == 200:
            print(f"Order {order_id} marked as READY on the server.")
            return True
        else:
            print(f"Failed to update status on server: HTTP {response.status_code}")
    except Exception as e:
        print(f"Error marking order as ready: {e}")
    return False

def main_loop():
    """Main execution loop that polls the server for print jobs."""
    if not login_as_admin():
        print("Initial login failed. Exiting script.")
        return

    print("Printsta Copier Auto-Print Daemon is now running. Polling queue...")
    
    while True:
        orders = get_active_orders()
        
        # Filter for orders with status "printing"
        # Status "printing" means the operator clicked "Start Print" on the dashboard.
        printing_jobs = [o for o in orders if o.get("status") == "printing"]
        
        if printing_jobs:
            print(f"Found {len(printing_jobs)} print jobs in progress.")
            
            for job in printing_jobs:
                order_id = job.get("_id")
                server_file_path = job.get("filePath")
                original_name = job.get("fileName")
                token_num = job.get("tokenNumber")
                
                print(f"Processing Token #{token_num} | File: {original_name}")
                
                # Make local print filename: Token_Num_Original_Name
                safe_original_name = "".join(c for c in original_name if c.isalnum() or c in "._- ")
                local_filename = f"Token_{token_num}_{safe_original_name}"
                
                # Download file
                local_file_path = download_file(server_file_path, local_filename)
                
                if local_file_path and local_file_path.exists():
                    print(f"Downloaded file to {local_file_path}")
                    
                    # Print file
                    if print_file_windows(local_file_path, job):
                        # Mark as ready in database
                        mark_order_ready(order_id)
                        # Optional: delete local copy after print spooling
                        try:
                            time.sleep(2) # brief buffer
                            os.remove(local_file_path)
                        except OSError:
                            pass
                    else:
                        print("Print action failed. Order status left unchanged.")
                else:
                    print("Download failed. Skipping job.")
        
        # Poll every 10 seconds
        time.sleep(10)

if __name__ == "__main__":
    try:
        main_loop()
    except KeyboardInterrupt:
        print("\nShutting down Printsta auto-print script.")
        sys.exit(0)
