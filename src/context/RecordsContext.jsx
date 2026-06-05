import { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchRecords, createRecord, updateRecord, deleteRecord } from "@/lib/api";

const RecordsContext = createContext(null);

export const RecordsProvider = ({ children }) => {
    const qc = useQueryClient();

    const { data: records = [], isLoading } = useQuery({
        queryKey: ["records"],
        queryFn: () => fetchRecords(),
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ["records"] });

    const addMutation = useMutation({ mutationFn: createRecord, onSuccess: invalidate });
    const updateMutation = useMutation({
        mutationFn: ({ id, body }) => updateRecord(id, body),
        onSuccess: invalidate,
    });
    const deleteMutation = useMutation({ mutationFn: deleteRecord, onSuccess: invalidate });

    return (
        <RecordsContext.Provider value={{
            records,
            isLoading,
            addRecord: (body) => addMutation.mutateAsync(body),
            updateRecord: (id, body) => updateMutation.mutateAsync({ id, body }),
            deleteRecord: (id) => deleteMutation.mutateAsync(id),
        }}>
            {children}
        </RecordsContext.Provider>
    );
};

export const useRecords = () => {
    const ctx = useContext(RecordsContext);
    if (!ctx) throw new Error("useRecords must be used within RecordsProvider");
    return ctx;
};
