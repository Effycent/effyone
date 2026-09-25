import { z } from "zod";

export const sportCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, "El código usa minúsculas, números y guion bajo (2 a 40 caracteres).");

export const newSportSchema = z.object({
  code: sportCodeSchema,
  name: z
    .string()
    .trim()
    .min(2, "El nombre necesita al menos 2 caracteres.")
    .max(60, "El nombre admite hasta 60 caracteres."),
});

export const teamSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre necesita al menos 2 caracteres.")
    .max(80, "El nombre admite hasta 80 caracteres."),
  short_name: z
    .string()
    .trim()
    .max(12, "La sigla admite hasta 12 caracteres.")
    .optional()
    .transform((v) => (v ? v : undefined)),
});

const tiebreakerEnum = z.enum(["head_to_head", "goal_diff", "goals_for", "wins", "fewer_cards"]);

export const tournamentFormatSchema = z.enum(["round_robin", "single_elimination"]);

export const newTournamentSchema = z
  .object({
    sport_id: z.uuid("Elige un deporte."),
    name: z
      .string()
      .trim()
      .min(2, "El nombre necesita al menos 2 caracteres.")
      .max(120, "El nombre admite hasta 120 caracteres."),
    format: tournamentFormatSchema,
    is_public: z.boolean(),
    // Liga
    round_robin_legs: z.union([z.literal(1), z.literal(2)]).optional(),
    win_points: z.coerce.number().int().min(0).max(100).optional(),
    draw_points: z.coerce.number().int().min(0).max(100).optional(),
    loss_points: z.coerce.number().int().min(0).max(100).optional(),
    tie_breakers: z.array(tiebreakerEnum).max(5).optional(),
    // Eliminatoria
    bracket_seeding: z.enum(["random", "manual"]).optional(),
    third_place_match: z.boolean().optional(),
    // Disciplina (aplica a todo el torneo)
    discipline_yellow_for_suspension: z
      .union([z.literal(""), z.coerce.number().int().min(2).max(10)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    discipline_suspension_matches: z.coerce.number().int().min(1).max(10),
    discipline_red_suspension_matches: z.coerce.number().int().min(1).max(10),
    discipline_cards_reset_between_stages: z.boolean(),
  })
  .refine(
    (v) => v.format !== "round_robin" || (v.round_robin_legs && v.win_points !== undefined && v.draw_points !== undefined && v.loss_points !== undefined),
    { message: "Completa los parámetros de la Liga.", path: ["win_points"] },
  )
  .refine(
    (v) => v.format !== "single_elimination" || (v.bracket_seeding && v.third_place_match !== undefined),
    { message: "Completa los parámetros de la Eliminatoria.", path: ["bracket_seeding"] },
  );

export const rosterPlayerSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "El nombre necesita al menos 2 caracteres.")
    .max(120, "El nombre admite hasta 120 caracteres."),
  jersey_number: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(999)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  document_id: z
    .union([z.literal(""), z.string().trim().min(3).max(30)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});
