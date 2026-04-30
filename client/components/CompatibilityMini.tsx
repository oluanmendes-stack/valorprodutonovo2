import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSupabaseCompatibility } from "@/hooks/useSupabaseCompatibility";
import { Search, Trash2, Edit, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface CompatibilityRecord {
  id: string;
  equipamento: string;
  parametro: string;
  fabricante: string;
  modelo: string;
  acessorio: string;
  foto_produto: string[];
  foto_conexao: string[];
  observacoes: string;
}

export default function CompatibilityMini() {
  const { records, deleteRecord } = useSupabaseCompatibility();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return records;

    const term = searchTerm.toLowerCase();
    return records.filter(
      (record) =>
        record.equipamento.toLowerCase().includes(term) ||
        record.fabricante.toLowerCase().includes(term) ||
        record.modelo.toLowerCase().includes(term) ||
        record.acessorio.toLowerCase().includes(term) ||
        record.parametro.toLowerCase().includes(term)
    );
  }, [records, searchTerm]);

  const handleDeleteRecord = async (id: string) => {
    if (confirm("Tem certeza que deseja remover este registro?")) {
      try {
        await deleteRecord(id);
        toast.success("Produto removido com sucesso!");
      } catch (error) {
        console.error("Error deleting record:", error);
        toast.error("Erro ao remover produto");
      }
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-600 mb-2">Compatibilidade</h3>
          <p className="text-sm text-muted-foreground">
            Visualize e gerencie compatibilidades de produtos
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por equipamento, fabricante, modelo ou código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* List */}
        <div className="space-y-2 max-h-96 overflow-y-auto border border-border rounded-lg p-3">
          {filteredData.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                {records.length === 0
                  ? "Nenhum registro de compatibilidade cadastrado"
                  : "Nenhum resultado encontrado"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredData.map((record) => (
                <div key={record.id} className="border border-border rounded-lg">
                  <button
                    onClick={() =>
                      setExpandedId(
                        expandedId === record.id ? null : record.id
                      )
                    }
                    className="w-full text-left p-3 hover:bg-muted/50 transition flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-500 text-sm">{record.equipamento}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {record.fabricante} {record.modelo}
                      </div>
                      <div className="text-xs font-mono text-primary mt-0.5">
                        {record.acessorio}
                      </div>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition ${
                        expandedId === record.id ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* Expanded Details */}
                  {expandedId === record.id && (
                    <div className="px-3 pb-3 border-t border-border space-y-3 bg-muted/30 pt-3">
                      {record.parametro && (
                        <div>
                          <div className="text-xs font-500 text-muted-foreground">
                            Parâmetro
                          </div>
                          <div className="text-sm">{record.parametro}</div>
                        </div>
                      )}

                      {record.observacoes && (
                        <div>
                          <div className="text-xs font-500 text-muted-foreground">
                            Observações
                          </div>
                          <div className="text-sm">{record.observacoes}</div>
                        </div>
                      )}

                      {record.foto_produto.length > 0 && (
                        <div>
                          <div className="text-xs font-500 text-muted-foreground mb-2">
                            Fotos do Produto
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {record.foto_produto.map((foto) => (
                              <div
                                key={foto}
                                className="text-xs bg-primary/20 text-primary px-2 py-1 rounded"
                              >
                                {foto}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {record.foto_conexao.length > 0 && (
                        <div>
                          <div className="text-xs font-500 text-muted-foreground mb-2">
                            Fotos de Conexão
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {record.foto_conexao.map((foto) => (
                              <div
                                key={foto}
                                className="text-xs bg-secondary/20 text-secondary px-2 py-1 rounded"
                              >
                                {foto}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            window.location.href = "/compatibility"
                          }
                          className="flex-1 text-xs"
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteRecord(record.id)}
                          className="flex-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remover
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Button */}
        <Button
          onClick={() => (window.location.href = "/compatibility")}
          className="w-full gap-2"
          variant="outline"
        >
          <Plus className="w-4 h-4" />
          Abrir Compatibilidade Completa
        </Button>
      </div>
    </Card>
  );
}
