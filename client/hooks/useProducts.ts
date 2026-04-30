import { useState, useEffect } from "react";
import { toast } from "sonner";
import { fetchAllProducts, searchProductByCode, fetchProductsByCode, type Product as SupabaseProduct } from "@/lib/supabase";

export interface Product {
  code: string;
  description: string;
  price: number;
  priceWithIPI: number;
  manufacturer?: string;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const supabaseProducts = await fetchAllProducts();

        const productsWithManufacturer = supabaseProducts.map(
          (p: SupabaseProduct) => ({
            code: p.code,
            description: p.description,
            price: p.priceResale,
            priceWithIPI: p.priceResaleWithIPI,
            manufacturer: p.code.split("-")[0] || "Geral",
          })
        );
        setProducts(productsWithManufacturer);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        console.error("Error fetching products:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const searchProducts = async (query: string) => {
    if (!query.trim()) return [];

    try {
      const allProducts = await fetchAllProducts();
      const queryLower = query.toLowerCase();

      return allProducts
        .filter((p) =>
          p.code.toLowerCase().includes(queryLower) ||
          p.description.toLowerCase().includes(queryLower)
        )
        .map((p: SupabaseProduct) => ({
          code: p.code,
          description: p.description,
          price: p.priceResale,
          priceWithIPI: p.priceResaleWithIPI,
          manufacturer: p.code.split("-")[0] || "Geral",
        }));
    } catch (error) {
      console.error("Error searching products:", error);
      return [];
    }
  };

  const getProductByCode = async (code: string) => {
    try {
      const product = await searchProductByCode(code);

      if (product) {
        return {
          code: product.code,
          description: product.description,
          price: product.priceResale,
          priceWithIPI: product.priceResaleWithIPI,
          manufacturer: product.code.split("-")[0] || "Geral",
        };
      }
      return null;
    } catch (error) {
      console.error("Error fetching product:", error);
      return null;
    }
  };

  const refetch = async () => {
    try {
      setLoading(true);
      setError(null);

      const supabaseProducts = await fetchAllProducts();

      const productsWithManufacturer = supabaseProducts.map(
        (p: SupabaseProduct) => ({
          code: p.code,
          description: p.description,
          price: p.priceResale,
          priceWithIPI: p.priceResaleWithIPI,
          manufacturer: p.code.split("-")[0] || "Geral",
        })
      );
      setProducts(productsWithManufacturer);
      setError(null);
      toast.success("Dados atualizados com sucesso!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("Error refetching products:", err);
      toast.error(`Erro ao atualizar produtos: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return {
    products,
    loading,
    error,
    searchProducts,
    getProductByCode,
    refetch,
  };
}
