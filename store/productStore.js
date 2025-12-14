import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useProductStore = create(
  persist(
    () => ({
      products: [
        { id: "1", name: "テスト商品A", price: 2000,image: "https://picsum.photos/seed/1/300/200", },
        { id: "2", name: "テスト商品B", price: 3500,image: "https://picsum.photos/seed/2/300/200", },
        { id: "3", name: "テスト商品C", price: 1200,image: "https://picsum.photos/seed/3/300/200", },
     ],
    }),
    {
      name: "product-storage",
    }
  )
);