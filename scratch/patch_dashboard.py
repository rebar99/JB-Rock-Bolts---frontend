import re

path = r"D:\rebar-jbrocks\JB-Rock-Bolts---frontend\src\pages\Dashboard.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = re.sub(
    r'<DropdownMenuItem onClick=\{\(\) => navigate\("/credit-notes"\)\}>CN Adjustment <span className=\{`ml-auto pl-4 font-semibold \$\{\(stats\?\.credit_note_adjustment \?\? 0\) < 0 \? "text-destructive" : "text-success"\}\`\}>\{inr\(stats\?\.credit_note_adjustment \?\? 0\)\}<\/span><\/DropdownMenuItem>',
    '<DropdownMenuItem onClick={() => navigate("/credit-notes")}>CN Adjustment <span className="ml-auto pl-4 font-semibold text-destructive">-{inr(stats?.credit_note_adjustment ?? 0)}</span></DropdownMenuItem>',
    content
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched Dashboard.jsx")
