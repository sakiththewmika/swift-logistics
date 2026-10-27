def parse_string_to_dict(raw_msg):
    """
    Converts raw WMS string messages into structured JSON-like dict.
    Example: "ORD345:SHIPPED" -> {"orderId": "12345", "status": "SHIPPED"}
    """
    try:
        if raw_msg.startswith("PACKAGE_RELEASED|"):
            status, order_id = raw_msg.split("|", 1)
            return {"orderId": order_id, "status": status}
        if "|" in raw_msg:
            order_id, status = raw_msg.split("|", 1)
            return {"orderId": order_id, "status": status}
        order_id, status = raw_msg.split(":")
        return {"orderId": order_id, "status": status}
    except ValueError:
        return {"event": "UNKNOWN", "raw": raw_msg}

def parse_dict_to_string(message):
    """
    Converts structured JSON-like dict messages into raw WMS string format.
    Example: {"orderId": "12345", "status": "SHIPPED"} -> "ORD345:SHIPPED"
    """
    if message == "close":
        return message
    try:
        order_id = message.get("orderId", "UNKNOWN")
        status = message.get("status", "UNKNOWN")
        return f"{order_id}:{status}"
    except Exception:
        return "INVALID_MESSAGE"