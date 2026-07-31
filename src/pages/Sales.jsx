import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, ClipboardList } from "lucide-react";
import SalesInvoice from "@/pages/SalesInvoice";
import WorkOrderSales from "@/pages/WorkOrderSales";

const Sales = () => {
    const [tab, setTab] = useState("po");

    return (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 p-1 bg-muted/50 rounded-xl">
                <TabsTrigger value="po" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                    <FileText className="h-4 w-4 mr-2" /> Purchase Order Sales
                </TabsTrigger>
                <TabsTrigger value="wo" className="rounded-lg py-2 transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">
                    <ClipboardList className="h-4 w-4 mr-2" /> Work Order Sales
                </TabsTrigger>
            </TabsList>

            <TabsContent value="po">
                <SalesInvoice />
            </TabsContent>

            <TabsContent value="wo">
                <WorkOrderSales />
            </TabsContent>
        </Tabs>
    );
};

export default Sales;
