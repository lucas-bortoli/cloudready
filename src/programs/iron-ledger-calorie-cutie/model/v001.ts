/**
 * A calendar year node in the ledger.
 *
 * @example
 * ```ts
 * const year: NodeYear = { type: "year", year: 2026, children: [] };
 * ```
 */
export type NodeYear = { type: "year"; year: number; children: NodeMonth[] };

/**
 * A calendar month node, using zero-based month numbering (January is 0).
 *
 * @example
 * ```ts
 * const month: NodeMonth = { type: "month", month: 0, children: [] };
 * ```
 */
export type NodeMonth = {
  type: "month";
  month: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  children: NodeDay[];
};

/**
 * A calendar day node in the ledger. (zero is the first day of the month)
 *
 * @example
 * ```ts
 * const day: NodeDay = { type: "day", day: 0, children: [] };
 * ```
 */
export type NodeDay = {
  type: "day";
  day: number;
  children: (NodeWeightChange | NodeHeightChange | NodeMeal)[];
};

/**
 * A recorded change in body weight, in kg.
 *
 * @example
 * ```ts
 * const weighIn: NodeWeightChange = { type: "weight-change", value: 94 };
 * ```
 */
export type NodeWeightChange = { type: "weight-change"; value: number };

/**
 * A recorded change in body height, in cm.
 *
 * @example
 * ```ts
 * const heightChange: NodeHeightChange = { type: "height-change", value: 187 };
 * ```
 */
export type NodeHeightChange = { type: "height-change"; value: number };

/**
 * A named meal.
 *
 * @example
 * ```ts
 * const meal: NodeMeal = { type: "meal", name: "Breakfast", children: [] };
 * ```
 */
export type NodeMeal = { type: "meal"; name: string; children: NodeIngredient[] };

/**
 * An ingredient entry with an amount and optional nutrient reference amount.
 *
 * @example
 * ```ts
 * const ingredient: NodeIngredient = {
 *   type: "ingredient",
 *   name: "Bread",
 *   amount: 100,
 *   unit: "g",
 *   referenceValue: 100,
 *   children: [],
 * };
 * ```
 */
export type NodeIngredient = {
  type: "ingredient";
  name: string;
  amount: number;
  unit: IngredientMeasurementUnit;
  /**
   * Optional reference amount for the ingredient's nutrient values. Values are scaled
   * proportionally to `amount`; for example, 10g of protein per 100g becomes 5g
   * of protein when the ingredient amount is 50g.
   * They will be calculated using the same base unit.
   */
  referenceValue: number | null;
  children: (NodeNutrient | NodeIngredient)[];
};

/**
 * A supported unit for nutrient values, in practical terms.
 *
 * @example
 * ```ts
 * const weightUnit: IngredientMeasurementUnit = "kg";
 * ```
 */
export type IngredientMeasurementUnit = "g" | "kg" | "ml" | "l";
export const IngredientMeasurementUnits = ["g", "kg", "ml", "l"] as const;

/**
 * A nutrient value whose name and unit must match the nutrient definition.
 *
 * @example
 * ```ts
 * const protein: NodeNutrient = {
 *   type: "nutrient",
 *   nutrient: "protein",
 *   value: 30,
 *   unit: "g",
 * };
 * ```
 */
export type NodeNutrient = {
  [Nutrient in keyof NutrientUnits]: {
    type: "nutrient";
    nutrient: Nutrient;
    value: number;
    unit: NutrientUnits[Nutrient];
  };
}[keyof NutrientUnits];

/**
 * Maps each supported nutrient to its canonical unit.
 *
 * @example
 * ```ts
 * type ProteinUnit = NutrientUnits["protein"]; // "g"
 * ```
 */
export type NutrientUnits = {
  energy: "kcal";
  totalCarbohydrate: "g";
  dietaryFiber: "g";
  totalSugars: "g";
  addedSugars: "g";
  protein: "g";
  totalFat: "g";
  saturatedFat: "g";
  transFat: "g";
  cholesterol: "mg";
  vitaminC: "mg";
  vitaminD: "mcg";
  sodium: "mg";
  calcium: "mg";
  iron: "mg";
  potassium: "mg";
};

/**
 * Any node that can appear in the ledger tree.
 *
 * @example
 * ```ts
 * const node: Node = { type: "nutrient", nutrient: "protein", value: 30, unit: "g" };
 * ```
 */
export type Node =
  | NodeYear
  | NodeMonth
  | NodeDay
  | NodeWeightChange
  | NodeHeightChange
  | NodeMeal
  | NodeIngredient
  | NodeNutrient;

export type DataFile = { version: 1; rootNodes: NodeYear[] };
