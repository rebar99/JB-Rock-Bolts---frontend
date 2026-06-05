import { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    fetchPurchaseOrders,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    fetchPurchaseOrder,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/currentUser";

const PurchaseOrdersContext = createContext(null);

export const PurchaseOrdersProvider = ({ children }) => {
    const qc = useQueryClient();

    const { data: orders = [], isLoading } = useQuery({
        queryKey: ["purchase-orders"],
        queryFn: () => fetchPurchaseOrders(),
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ["purchase-orders"] });

    const addMutation = useMutation({
        mutationFn: (body) => createPurchaseOrder({ ...body, created_by: getCurrentUser() }),
        onSuccess: invalidate,
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, body }) =>
            updatePurchaseOrder(id, { ...body, last_updated_by: getCurrentUser() }),
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: deletePurchaseOrder,
        onSuccess: invalidate,
    });

    const markOpenedMutation = useMutation({
        mutationFn: (id) => fetchPurchaseOrder(id, getCurrentUser()),
        onSuccess: invalidate,
    });

    return (
        <PurchaseOrdersContext.Provider value={{
            orders,
            isLoading,
            addOrder: (body) => addMutation.mutateAsync(body),
            updateOrder: (id, body) => updateMutation.mutateAsync({ id, body }),
            deleteOrder: (id) => deleteMutation.mutateAsync(id),
            markOpened: (id) => markOpenedMutation.mutateAsync(id),
        }}>
            {children}
        </PurchaseOrdersContext.Provider>
    );
};

export const usePurchaseOrders = () => {
    const ctx = useContext(PurchaseOrdersContext);
    if (!ctx) throw new Error("usePurchaseOrders must be used within PurchaseOrdersProvider");
    return ctx;
};
