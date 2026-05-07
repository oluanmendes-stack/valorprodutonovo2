import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import BatchProductComponent from "./BatchProduct";

// Format price in Brazilian format (with comma for cents)
const formatPrice = (price: number): string => {
  return price.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface BatchProductData {
  code: string;
  description: string;
  marca: string;
  descriptor?: string | null;
  price: number;
  priceWithIPI: number;
  totalPrice: number;
  totalPriceWithIPI: number;
  distributorPrice?: number;
  finalPrice?: number;
  priceMultiplied?: number;
}

interface BatchReportData {
  lote: string;
  codes: string[];
  quantity: number;
  products: BatchProductData[];
  batchTotalPrice: number;
  batchTotalPriceWithIPI: number;
}

interface BatchReportProps {
  reports: BatchReportData[];
}

export default function BatchReport({ reports }: BatchReportProps) {
  if (reports.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Relatório de Lotes</h2>

      {reports.map((report, index) => (
        <Card key={index} className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-primary">Lote: {report.lote}</h3>
            <p className="text-sm text-muted-foreground">
              Quantidade: {report.quantity} | Códigos: {report.codes.length}
            </p>
          </div>

          {/* Products List */}
          <div className="space-y-4 mb-6">
            {report.products.map((product, idx) => (
              <BatchProductComponent
                key={idx}
                code={product.code}
                description={product.description}
                marca={product.marca}
                descriptor={product.descriptor}
                price={product.price}
                priceWithIPI={product.priceWithIPI}
                totalPrice={product.totalPrice}
                totalPriceWithIPI={product.totalPriceWithIPI}
                distributorPrice={product.distributorPrice}
                finalPrice={product.finalPrice}
                priceMultiplied={product.priceMultiplied}
              />
            ))}
          </div>

          {/* Batch Totals */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-600">Preço Total Distribuidor c/ IPI:</span>
              <span className="text-lg font-bold text-primary">
                R$ {formatPrice(report.batchTotalPrice ?? 0)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Preço Total Final c/ IPI:</span>
              <span className="font-600 text-muted-foreground">
                R$ {formatPrice(report.batchTotalPriceWithIPI ?? 0)}
              </span>
            </div>
          </div>

          {/* Not found products warning */}
          {report.products.length < report.codes.length && (
            <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-orange-900 dark:text-orange-300">
                {report.codes.length - report.products.length} de {report.codes.length} código(s) não encontrado(s)
              </p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
