import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SkillItem {
  name: string;
  useWhen: string;
}

interface SkillGridProps {
  title: string;
  description: string;
  skills: SkillItem[];
}

export function SkillGrid({ title, description, skills }: SkillGridProps) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="mb-10 flex max-w-2xl flex-col gap-3">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <Card key={skill.name} className="h-full">
              <CardHeader>
                <CardTitle className="font-mono text-sm text-primary">
                  {skill.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {skill.useWhen}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
