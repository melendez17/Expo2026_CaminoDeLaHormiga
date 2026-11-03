/** Generates documentation from a fresh, in-memory database. Never connects to Supabase. */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = new URL("../../", import.meta.url);
const db = new PGlite();
type Column = {
  table_name: string;
  column_name: string;
  data_type: string;
  required: boolean;
  pk: boolean;
  unique_column: boolean;
  fk: boolean;
};
type Relation = {
  child: string;
  parent: string;
  column_name: string;
  parent_column: string;
  required: boolean;
  unique_column: boolean;
};
const groups: Record<string, string[]> = {
  Identidad: ["areas", "profiles"],
  "Catálogo y configuración": [
    "buildings",
    "projects",
    "challenges",
    "questions",
    "agenda",
    "configuration",
  ],
  "Recorrido y respuestas": [
    "progress",
    "assignments",
    "assignment_changes",
    "completions",
    "attempts",
    "surveys",
  ],
  "Tiquetes, votos y rifa": ["tickets", "votes", "raffles"],
  "Seguridad y operación": [
    "sessions",
    "email_codes",
    "mail_outbox",
    "requests",
    "rate_limits",
    "audit",
  ],
};
const alias = (name: string) => name.replaceAll(".", "_");
async function main() {
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
    );
    const migrationRoot = new URL("supabase/migrations/", root);
    for (const name of readdirSync(migrationRoot)
      .filter(
        (name) =>
          name >= "202611030001_production.sql" && name.endsWith(".sql"),
      )
      .sort()) {
      await db.exec(readFileSync(new URL(name, migrationRoot), "utf8"));
    }
    const columns = (
      await db.query<Column>(`
    select c.relname table_name, a.attname column_name, format_type(a.atttypid,a.atttypmod) data_type, a.attnotnull required,
      exists(select 1 from pg_constraint k where k.conrelid=c.oid and k.contype='p' and a.attnum=any(k.conkey)) pk,
      exists(select 1 from pg_constraint k where k.conrelid=c.oid and k.contype in ('p','u') and k.conkey=array[a.attnum]) unique_column,
      exists(select 1 from pg_constraint k where k.conrelid=c.oid and k.contype='f' and a.attnum=any(k.conkey)) fk
    from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid
    where n.nspname='camino' and c.relkind='r' and a.attnum>0 and not a.attisdropped
    order by c.relname,a.attnum
  `)
    ).rows;
    const relations = (
      await db.query<Relation>(`
    select child.relname child, pn.nspname||'.'||parent.relname parent, a.attname column_name, pa.attname parent_column,
      a.attnotnull required,
      exists(select 1 from pg_constraint u where u.conrelid=child.oid and u.contype in ('p','u') and u.conkey=k.conkey) unique_column
    from pg_constraint k join pg_class child on child.oid=k.conrelid join pg_namespace cn on cn.oid=child.relnamespace
    join pg_class parent on parent.oid=k.confrelid join pg_namespace pn on pn.oid=parent.relnamespace
    join pg_attribute a on a.attrelid=child.oid and a.attnum=k.conkey[1]
    join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=k.confkey[1]
    where k.contype='f' and cn.nspname='camino' order by child.relname,a.attname
  `)
    ).rows;
    const tables = [...new Set(columns.map((c) => c.table_name))];
    const expected = Object.values(groups).flat();
    if (
      tables.length !== expected.length ||
      tables.some((t) => !expected.includes(t))
    )
      throw Error(
        "Actualiza los grupos del diagrama: cambió el conjunto de tablas.",
      );
    const composite = (
      await db.query<{
        table_name: string;
        name: string;
        kind: string;
        definition: string;
      }>(`
    select c.relname table_name,k.conname name,k.contype kind,pg_get_constraintdef(k.oid) definition
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='camino' and k.contype in ('p','u') and cardinality(k.conkey)>1 order by c.relname,k.conname
  `)
    ).rows;
    const uml = [
      "@startuml database",
      "title Camino de la Hormiga · Base de datos Supabase",
      "hide methods",
      "hide circle",
      "skinparam classAttributeIconSize 0",
      "skinparam linetype ortho",
      "skinparam shadowing false",
      "skinparam backgroundColor #FFFFFF",
      "skinparam class {",
      "  BackgroundColor #F3F9F5",
      "  BorderColor #17573C",
      "  ArrowColor #426554",
      "}",
      "legend left",
      "  PK = clave primaria (puede ser compuesta)",
      "  FK = clave foránea real",
      "  UQ = unicidad de una columna",
      "  ? = admite NULL",
      "  Las relaciones dibujadas corresponden únicamente a FK SQL.",
      "endlegend",
      'package "Supabase Auth · externo" {',
      '  class "auth.users" as auth_users <<externa>> {',
      "    id : uuid [PK]",
      "  }",
      "}",
    ];
    for (const [group, names] of Object.entries(groups)) {
      uml.push(`package "${group}" {`);
      for (const table of names) {
        uml.push(`  class "camino.${table}" as camino_${table} <<table>> {`);
        for (const c of columns.filter((c) => c.table_name === table)) {
          const flags = [
            c.pk ? "PK" : "",
            c.fk ? "FK" : "",
            c.unique_column && !c.pk ? "UQ" : "",
          ].filter(Boolean);
          uml.push(
            `    ${c.column_name} : ${c.data_type}${c.required ? "" : "?"}${flags.length ? " [" + flags.join(", ") + "]" : ""}`,
          );
        }
        const constraints = composite.filter((c) => c.table_name === table);
        if (constraints.length) {
          uml.push("    --");
          for (const c of constraints) uml.push(`    {field} ${c.definition}`);
        }
        uml.push("  }");
      }
      uml.push("}");
    }
    for (const r of relations)
      uml.push(
        `${alias(r.parent)} "${r.required ? "1" : "0..1"}" -- "${r.unique_column ? "0..1" : "0..*"}" camino_${r.child} : ${r.column_name}`,
      );
    uml.push(
      "note bottom of camino_profiles",
      "  role: admin | visitor | admission",
      "  email y public_token únicos.",
      "  Auth es opcional y heredado para admins; acceso actual por token.",
      "end note",
    );
    uml.push(
      "note bottom of camino_configuration",
      "  Fila única. document contiene catálogo y reglas.",
      "  progress.snapshot conserva el avance canónico.",
      "  Ambos se sincronizan con las proyecciones SQL mediante RPC.",
      "end note",
    );
    uml.push(
      "note bottom of camino_requests",
      "  actor_id/request_id son correlaciones lógicas, no FK.",
      "  catalog_version y audit.request_id tampoco tienen FK.",
      "  mail_outbox no tiene FK a perfiles: envelope está cifrado.",
      "end note",
    );
    uml.push("@enduml", "");
    writeFileSync(new URL("docs/supabase/database.puml", root), uml.join("\n"));
    // A standalone SVG for viewing without PlantUML or network renderers.
    const escape = (s: string) =>
      s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    const dot = [
      "digraph database {",
      'graph [rankdir=LR, bgcolor="white", pad=0.3, nodesep=0.3, ranksep=1.1, fontname="Arial", label="Camino de la Hormiga · UML de la base de datos\\nPK: primaria · FK: foránea · UQ: única · ?: nullable · Líneas: FK reales", labelloc=t, fontsize=23];',
      'node [shape=plain, fontname="Arial"];',
      'edge [color="#426554", fontname="Arial", fontsize=10, arrowsize=0.5];',
    ];
    for (const [index, [group, names]] of Object.entries(groups).entries()) {
      dot.push(
        `subgraph cluster_${index} { label="${group}"; color="#D8E9DE"; style="rounded";`,
      );
      for (const table of names) {
        const rows = columns
          .filter((c) => c.table_name === table)
          .map((c) => {
            const flags = [
              c.pk ? "PK" : "",
              c.fk ? "FK" : "",
              c.unique_column && !c.pk ? "UQ" : "",
            ]
              .filter(Boolean)
              .join(", ");
            return `<TR><TD ALIGN="LEFT">${escape(c.column_name)}${flags ? " [" + flags + "]" : ""}</TD><TD ALIGN="LEFT">${escape(c.data_type)}${c.required ? "" : "?"}</TD></TR>`;
          });
        for (const c of composite.filter((c) => c.table_name === table))
          rows.push(
            `<TR><TD COLSPAN="2" ALIGN="LEFT"><FONT POINT-SIZE="10">${escape(c.definition)}</FONT></TD></TR>`,
          );
        dot.push(
          `camino_${table} [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5" COLOR="#17573C"><TR><TD COLSPAN="2" BGCOLOR="#17573C"><FONT COLOR="white"><B>camino.${table}</B></FONT></TD></TR>${rows.join("")}</TABLE>>];`,
        );
      }
      dot.push("}");
    }
    dot.push(
      'auth_users [label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="7" COLOR="#888888"><TR><TD BGCOLOR="#EEEEEE"><B>auth.users · externo</B></TD></TR><TR><TD>id : uuid [PK]</TD></TR></TABLE>>];',
    );
    for (const r of relations)
      dot.push(
        `${alias(r.parent)} -> camino_${r.child} [dir=none, label="${r.column_name}", taillabel="${r.required ? "1" : "0..1"}", headlabel="${r.unique_column ? "0..1" : "0..*"}"];`,
      );
    dot.push("}", "");
    writeFileSync(new URL("docs/supabase/database.dot", root), dot.join("\n"));
    if (process.argv.includes("--svg"))
      execFileSync("dot", [
        "-Tsvg",
        fileURLToPath(new URL("docs/supabase/database.dot", root)),
        "-o",
        fileURLToPath(new URL("docs/supabase/database.svg", root)),
      ]);
    console.log(
      `UML generado: ${tables.length} tablas camino + auth.users; ${relations.length} FK reales. Sin conexión remota.`,
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
