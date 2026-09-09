"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guards";
import { profileSchema, type DependentInput } from "@/lib/validation/profile.schema";

export interface OnboardingFormState {
  error?: string;
}

function parseDependentsFromFormData(formData: FormData): DependentInput[] {
  const count = Number(formData.get("dependentCount") ?? 0);
  const dependents: DependentInput[] = [];

  for (let i = 0; i < count; i++) {
    const relationship = formData.get(`dependent_relationship_${i}`);
    const dateOfBirth = formData.get(`dependent_dob_${i}`);
    if (!relationship || !dateOfBirth) continue;

    dependents.push({
      relationship: relationship as DependentInput["relationship"],
      dateOfBirth: String(dateOfBirth),
      hasExistingConditions: formData.get(`dependent_conditions_${i}`) === "on",
    });
  }

  return dependents;
}

export async function saveProfileAction(
  _prevState: OnboardingFormState,
  formData: FormData
): Promise<OnboardingFormState> {
  const user = await requireAuth();

  const parsed = profileSchema.safeParse({
    dateOfBirth: formData.get("dateOfBirth"),
    region: formData.get("region"),
    desiredTier: formData.get("desiredTier"),
    hasExistingConditions: formData.get("hasExistingConditions") === "on",
    conditionsNotes: formData.get("conditionsNotes") ?? "",
    dependents: parseDependentsFromFormData(formData),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const { dependents, ...profileFields } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.profile.upsert({
      where: { userId: user.id },
      update: {
        dateOfBirth: new Date(profileFields.dateOfBirth),
        region: profileFields.region,
        desiredTier: profileFields.desiredTier,
        hasExistingConditions: profileFields.hasExistingConditions,
        conditionsNotes: profileFields.conditionsNotes || null,
      },
      create: {
        userId: user.id,
        dateOfBirth: new Date(profileFields.dateOfBirth),
        region: profileFields.region,
        desiredTier: profileFields.desiredTier,
        hasExistingConditions: profileFields.hasExistingConditions,
        conditionsNotes: profileFields.conditionsNotes || null,
      },
    });

    // Simplest correct approach for v1: replace the dependent set on every save.
    await tx.dependent.deleteMany({ where: { userId: user.id } });
    if (dependents.length > 0) {
      await tx.dependent.createMany({
        data: dependents.map((dependent) => ({
          userId: user.id,
          relationship: dependent.relationship,
          dateOfBirth: new Date(dependent.dateOfBirth),
          hasExistingConditions: dependent.hasExistingConditions,
        })),
      });
    }
  });

  redirect("/quotes");
}

export async function getExistingOnboardingData(userId: string) {
  const [profile, dependents] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.dependent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { profile, dependents };
}
