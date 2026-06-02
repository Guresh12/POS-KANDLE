import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Product } from '@workspace/api-client-react';

interface CartItem extends Product {
  cartQuantity: number;
  discount: number;
}

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  selectedBranchId: number | null;
  setSelectedBranchId: (id: number | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      selectedBranchId: null,
      setSelectedBranchId: (id) => set({ selectedBranchId: id }),
    }),
    {
      name: 'swiftpos-app-storage',
    }
  )
);

interface CartState {
  items: CartItem[];
  customerId: number | null;
  globalDiscount: number;
  addItem: (product: Product) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  updateDiscount: (productId: number, discount: number) => void;
  setCustomerId: (id: number | null) => void;
  setGlobalDiscount: (discount: number) => void;
  clearCart: () => void;
  getTotals: () => { subtotal: number; tax: number; totalDiscount: number; total: number };
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customerId: null,
  globalDiscount: 0,
  addItem: (product) => set((state) => {
    const existing = state.items.find(i => i.id === product.id);
    if (existing) {
      return { items: state.items.map(i => i.id === product.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i) };
    }
    return { items: [...state.items, { ...product, cartQuantity: 1, discount: 0 }] };
  }),
  removeItem: (productId) => set((state) => ({ items: state.items.filter(i => i.id !== productId) })),
  updateQuantity: (productId, quantity) => set((state) => ({
    items: state.items.map(i => i.id === productId ? { ...i, cartQuantity: quantity } : i)
  })),
  updateDiscount: (productId, discount) => set((state) => ({
    items: state.items.map(i => i.id === productId ? { ...i, discount } : i)
  })),
  setCustomerId: (id) => set({ customerId: id }),
  setGlobalDiscount: (globalDiscount) => set({ globalDiscount }),
  clearCart: () => set({ items: [], customerId: null, globalDiscount: 0 }),
  getTotals: () => {
    const { items, globalDiscount } = get();
    let subtotal = 0;
    let tax = 0;
    let itemDiscounts = 0;
    
    items.forEach(item => {
      const lineTotal = item.sellingPrice * item.cartQuantity;
      itemDiscounts += item.discount;
      subtotal += lineTotal;
      if (item.taxRate) {
        tax += ((lineTotal - item.discount) * item.taxRate) / 100;
      }
    });

    const totalDiscount = itemDiscounts + globalDiscount;
    const total = subtotal + tax - totalDiscount;

    return { subtotal, tax, totalDiscount, total };
  }
}));
