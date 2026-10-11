import { z } from 'zod';

export const appRoles = ['CUSTOMER', 'WAITER', 'CHEF', 'CASHIER', 'MANAGER', 'ADMIN'] as const;
export const tableStatuses = ['FREE', 'OCCUPIED', 'BILL_REQUESTED'] as const;
export const orderTypes = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const;
export const orderStatuses = ['PENDING', 'RECEIVED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED'] as const;
export const itemStatuses = ['PENDING', 'PREPARING', 'READY', 'SERVED'] as const;
export const stations = ['KITCHEN', 'BAR', 'COUNTER'] as const;
export const paymentMethods = ['CASH', 'UPI', 'CARD', 'ONLINE'] as const;
export const paymentStatuses = ['PENDING', 'PAID', 'FAILED'] as const;

export type AppRole = (typeof appRoles)[number];
export type TableStatus = (typeof tableStatuses)[number];
export type OrderType = (typeof orderTypes)[number];
export type OrderStatus = (typeof orderStatuses)[number];
export type ItemStatus = (typeof itemStatuses)[number];
export type Station = (typeof stations)[number];
export type PaymentMethod = (typeof paymentMethods)[number];
export type PaymentStatus = (typeof paymentStatuses)[number];

// ---------------------------------------------------------------------------
// Order lifecycle (Phase 2) — ONE transitions table used by API and web.
// Rules: cancel only before SERVED; COMPLETED is reached only via billing close.
// Keyed by "from" status -> allowed "from"->"to" moves and the roles that may
// perform each move. Wrong role = 403 ORDER_STATUS_FORBIDDEN.
// Invalid move = 409 ORDER_TRANSITION_NOT_ALLOWED.
// ---------------------------------------------------------------------------
export const orderTransitions: Record<OrderStatus, Partial<Record<OrderStatus, AppRole[]>>> = {
  PENDING: {
    RECEIVED: ['WAITER', 'CHEF', 'MANAGER', 'ADMIN'],
    CANCELLED: ['WAITER', 'CASHIER', 'MANAGER', 'ADMIN'],
  },
  RECEIVED: {
    PREPARING: ['CHEF', 'MANAGER', 'ADMIN'],
    CANCELLED: ['WAITER', 'CASHIER', 'MANAGER', 'ADMIN'],
  },
  PREPARING: {
    READY: ['CHEF', 'MANAGER', 'ADMIN'],
    CANCELLED: ['WAITER', 'CASHIER', 'MANAGER', 'ADMIN'],
  },
  READY: {
    SERVED: ['WAITER', 'MANAGER', 'ADMIN'],
    CANCELLED: ['WAITER', 'CASHIER', 'MANAGER', 'ADMIN'],
  },
  SERVED: {
    COMPLETED: ['CASHIER', 'MANAGER', 'ADMIN'],
  },
  COMPLETED: {},
  CANCELLED: {},
};

export const itemTransitions: Record<ItemStatus, Partial<Record<ItemStatus, AppRole[]>>> = {
  PENDING: {
    PREPARING: ['CHEF', 'MANAGER', 'ADMIN'],
    READY: ['CHEF', 'MANAGER', 'ADMIN'],
  },
  PREPARING: {
    READY: ['CHEF', 'MANAGER', 'ADMIN'],
  },
  READY: {
    SERVED: ['WAITER', 'MANAGER', 'ADMIN'],
  },
  SERVED: {},
};

export type TransitionError = 'ORDER_TRANSITION_NOT_ALLOWED' | 'ORDER_STATUS_FORBIDDEN';

/** Returns null when the transition is allowed, otherwise why it is rejected. */
export function orderTransitionError(from: OrderStatus, to: OrderStatus, role: AppRole): TransitionError | null {
  const roles = orderTransitions[from]?.[to];
  if (!roles) return 'ORDER_TRANSITION_NOT_ALLOWED';
  return roles.includes(role) ? null : 'ORDER_STATUS_FORBIDDEN';
}

export function itemTransitionError(from: ItemStatus, to: ItemStatus, role: AppRole): TransitionError | null {
  const roles = itemTransitions[from]?.[to];
  if (!roles) return 'ORDER_TRANSITION_NOT_ALLOWED';
  return roles.includes(role) ? null : 'ORDER_STATUS_FORBIDDEN';
}

export const placeOrderSchema = z.object({
  qrToken: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128),
  notes: z.string().max(500).optional().nullable(),
  items: z.array(z.object({
    menuItemId: z.string().min(1),
    quantity: z.number().int().min(1).max(99),
    notes: z.string().max(250).optional().nullable(),
    addonIds: z.array(z.string().min(1)).max(20).default([]),
  })).min(1).max(50),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
const staffOrderBaseSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
  type: z.enum(orderTypes),
  tableId: z.string().min(1).optional(),
  notes: z.string().max(500).optional().nullable(),
  items: z.array(z.object({
    menuItemId: z.string().min(1),
    quantity: z.number().int().min(1).max(99),
    notes: z.string().max(250).optional().nullable(),
    addonIds: z.array(z.string().min(1)).max(20).default([]),
  })).min(1).max(50),
});

export const staffOrderSchema = staffOrderBaseSchema.superRefine((order, context) => {
  if (order.type === 'DINE_IN' && !order.tableId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['tableId'],
      message: 'A table is required for dine-in orders',
    });
  }
});
export type StaffOrderInput = z.infer<typeof staffOrderSchema>;
export const addOrderItemsSchema = z.object({
  items: staffOrderBaseSchema.shape.items,
});
export type AddOrderItemsInput = z.infer<typeof addOrderItemsSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(orderStatuses),
});

export const updateOrderItemStatusSchema = z.object({
  status: z.enum(itemStatuses),
});

export const createDiningTableSchema = z.object({
  number: z.coerce.number().int().positive(),
  capacity: z.coerce.number().int().min(1).max(30).default(4),
});

export const updateDiningTableSchema = createDiningTableSchema.partial().extend({
  status: z.enum(tableStatuses).optional(),
});

export const qrTokenSchema = z.string().trim().min(1).max(128);

export const closeOrderSchema = z.object({
  couponCode: z.string().trim().min(1).max(32).optional(),
  payments: z.array(z.object({
    method: z.enum(paymentMethods),
    amount: z.string().regex(/^(?=.*[1-9])\d+(\.\d{1,2})?$/, 'Payment amount must be positive with at most two decimal places'),
  })).max(5),
});

export type CloseOrderInput = z.infer<typeof closeOrderSchema>;
export const billPreviewSchema = z.object({
  couponCode: z.string().trim().min(1).max(32).optional(),
});

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone number is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface UserDto {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: AppRole;
  isActive: boolean;
  createdAt: string;
}

export const createStaffSchema = z.object({
  name: z.string().min(1, 'Staff name is required').trim(),
  email: z.string().email('Email must be valid').trim().optional().or(z.literal('')),
  phone: z.string().min(7, 'Phone number is required').trim().optional().or(z.literal('')),
  role: z.enum(appRoles),
});

export const updateStaffSchema = z.object({
  name: z.string().min(1, 'Staff name is required').trim().optional(),
  email: z.string().email('Email must be valid').trim().optional().nullable(),
  phone: z.string().min(7, 'Phone number is required').trim().optional().nullable(),
  role: z.enum(appRoles).optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').trim(),
  description: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

const decimalStringSchema = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, 'Enter a valid amount with at most two decimal places');
const positiveDecimalStringSchema = decimalStringSchema.refine(
  (value) => /^\d+(?:\.\d{1,2})?$/.test(value) && /[1-9]/.test(value),
  'Amount must be greater than 0',
);
const percentStringSchema = decimalStringSchema.refine((value) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return false;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) <= 10_000n;
}, 'Tax percent cannot exceed 100');

export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    menuItems: number;
  };
}

export const createMenuItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').trim(),
  description: z.string().optional().nullable(),
  price: positiveDecimalStringSchema,
  categoryId: z.string().min(1, 'Category is required'),
  isVeg: z.boolean().default(true),
  station: z.enum(stations).default('KITCHEN'),
  taxPercent: percentStringSchema.default('5'),
  prepTimeMin: z.coerce.number().int().positive('Prep time must be positive').default(15),
  isAvailable: z.boolean().default(true),
  imageUrl: z.string().url('Invalid image URL').optional().nullable().or(z.literal('')),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();

export const toggleAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type ToggleAvailabilityInput = z.infer<typeof toggleAvailabilitySchema>;

export interface AddonDto {
  id: string;
  menuItemId: string;
  name: string;
  price: string;
}

export interface MenuItemAddonDto extends AddonDto {}

export interface MenuItemDto {
  id: string;
  name: string;
  description: string | null;
  price: string;
  categoryId: string;
  category?: CategoryDto;
  isVeg: boolean;
  station: Station;
  taxPercent: string;
  prepTimeMin: number;
  isAvailable: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  addons?: AddonDto[];
}

export const createAddonSchema = z.object({
  name: z.string().min(1, 'Addon name is required').trim(),
  price: decimalStringSchema,
});

export const updateAddonSchema = createAddonSchema.partial();

export type CreateAddonInput = z.infer<typeof createAddonSchema>;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface SharedHealthResponse {
  status: 'ok';
}

export const healthSchema = {
  status: 'ok',
};

export const createIngredientSchema = z.object({
  name: z.string().min(1, 'Ingredient name is required').trim(),
  unit: z.string().min(1, 'Ingredient unit is required').trim(),
  stockQty: z.coerce.number().min(0, 'Stock cannot be negative').default(0),
  reorderLevel: z.coerce.number().min(0, 'Minimum stock cannot be negative').default(0),
});

export const updateIngredientSchema = createIngredientSchema.partial();

export const recipeItemSchema = z.object({
  ingredientId: z.string().min(1, 'Ingredient is required'),
  qtyUsed: z.coerce.number().positive('Quantity must be greater than zero'),
});

export const updateRecipeSchema = z.object({
  items: z.array(recipeItemSchema).min(1, 'At least one ingredient is required'),
});

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type RecipeItemInput = z.infer<typeof recipeItemSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

export interface IngredientDto {
  id: string;
  name: string;
  unit: string;
  stockQty: string;
  reorderLevel: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeItemDto {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  qtyUsed: string;
  stockQty: string;
  reorderLevel: string;
}

export const reportRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD').optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type ReportRangeInput = z.infer<typeof reportRangeSchema>;

export const createPaymentOrderSchema = z.object({
  orderId: z.string().min(1),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, 'Order id is required'),
  razorpay_payment_id: z.string().min(1, 'Payment id is required'),
  razorpay_signature: z.string().min(1, 'Signature is required'),
});

export const verifyPaymentWebhookSchema = z.object({
  event: z.string().min(1),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1),
      }),
    }),
  }),
});

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

// ---------------------------------------------------------------------------
// Phase 5 — missing operations (cancel, void item, coupons, stock adjust).
// ---------------------------------------------------------------------------

/** Free-text reason required for any cancel/void so the audit trail is meaningful. */
const actionReasonSchema = z.string().trim().min(3, 'A reason of at least 3 characters is required').max(500);

export const cancelOrderSchema = z.object({
  reason: actionReasonSchema,
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const cancelOrderItemSchema = z.object({
  reason: actionReasonSchema,
});
export type CancelOrderItemInput = z.infer<typeof cancelOrderItemSchema>;

export const couponTypes = ['PERCENT', 'FIXED'] as const;
export type CouponType = (typeof couponTypes)[number];

const couponBaseSchema = z.object({
  code: z.string().trim().min(3, 'Coupon code is required').max(32)
    .transform((value) => value.toUpperCase()),
  type: z.enum(couponTypes),
  value: z.coerce.number().positive('Coupon value must be greater than 0'),
  minOrderValue: z.coerce.number().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
  validFrom: z.coerce.date().optional().nullable(),
  validTo: z.coerce.date().optional().nullable(),
});

export const createCouponSchema = couponBaseSchema.superRefine((coupon, context) => {
  if (coupon.type === 'PERCENT' && coupon.value > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Percent discount cannot exceed 100' });
  }
  if (coupon.validFrom && coupon.validTo && coupon.validTo <= coupon.validFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'Expiry must be after the start date' });
  }
});

export const updateCouponSchema = couponBaseSchema.partial();

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

export interface CouponDto {
  id: string;
  code: string;
  type: CouponType;
  value: string;
  minOrderValue: string | null;
  isActive: boolean;
  validFrom: string | null;
  validTo: string | null;
  usedCount: number;
  createdAt: string;
  updatedAt: string;
}

export const stockAdjustReasons = ['PURCHASE', 'WASTE', 'CORRECTION'] as const;
export type StockAdjustReason = (typeof stockAdjustReasons)[number];

export const adjustStockSchema = z.object({
  delta: z.string().trim().regex(/^-?\d+(?:\.\d{1,2})?$/, 'Delta must be a decimal with at most two decimals (positive or negative)')
    .refine((value) => value !== '0' && !/^(-?0(\.0+)?)$/.test(value), 'Delta cannot be zero'),
  reason: z.enum(stockAdjustReasons),
  note: z.string().trim().max(500).optional().nullable(),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export interface StockMovementDto {
  id: string;
  ingredientId: string;
  ingredientName: string;
  delta: string;
  reason: StockAdjustReason;
  note: string | null;
  user: string | null;
  createdAt: string;
}
