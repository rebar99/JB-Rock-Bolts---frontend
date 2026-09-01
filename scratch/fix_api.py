import sys

content = open('src/lib/api.js', 'r', encoding='utf-8').read()
if 'export const increasePOQuantity' in content:
    content = content[:content.find('export const increasePOQuantity')]

append_str = '''
export const increasePOQuantity = async (id, data) => {
    const token = localStorage.getItem("token");
    const response = await fetch(\\/api/purchase-orders/\/increase-quantity\, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: \Bearer \\ } : {}),
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to increase PO quantity");
    }
    return response.json();
};

export const increaseWOQuantity = async (id, data) => {
    const token = localStorage.getItem("token");
    const response = await fetch(\\/api/work-orders/\/increase-quantity\, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: \Bearer \\ } : {}),
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to increase Work Order quantity");
    }
    return response.json();
};
'''

# Un-escape the backticks and dollar signs from the raw string above so they are output correctly in javascript.
append_str = append_str.replace('\', '').replace('\$', '$')

with open('src/lib/api.js', 'w', encoding='utf-8') as f:
    f.write(content.strip() + '\n\n' + append_str.strip() + '\n')
