import re

path = r"D:\rebar-jbrocks\JB-Rock-Bolts---frontend\src\pages\CreditNotes.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace <span className="block truncate">{it.item}</span>
content = content.replace(
    '<span className="block truncate">{it.item}</span>',
    '<span className="block whitespace-normal">{it.item}</span>'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched truncate in CreditNotes.jsx")
