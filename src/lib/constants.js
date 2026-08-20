import { useQuery } from "@tanstack/react-query";
import { fetchConstants } from "@/lib/api";

const FALLBACK = {
    products: [],
    uom_options: ["Nos", "MT", "Kg", "Ton", "Set", "Meter", "Sqm", "Cum", "Ltr", "Box", "Unit", "ZNS", "PC"],
    clients: [],
    wo_clients: [],
    po_clients: [],
    locations: [],
    projects: [],
    payment_terms: [],
    payment_statuses: ["Pending", "Paid"],
    delivery_statuses: ["Not Delivered", "Delivered"],
    inventory_statuses: ["In Stock", "Low Stock", "Out of Stock"],
    wo_statuses: ["Pending", "In Progress", "Partial", "Completed", "Closed", "Cancelled"],
    wo_priorities: ["Low", "Medium", "High", "Urgent"],
};

export function useConstants() {
    const { data } = useQuery({
        queryKey: ["constants"],
        queryFn: fetchConstants,
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
    });
    return data || FALLBACK;
}
