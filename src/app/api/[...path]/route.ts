import { productionHandler } from "@/lib/backend/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = productionHandler;
export const POST = productionHandler;
export const PUT = productionHandler;
export const PATCH = productionHandler;
export const DELETE = productionHandler;
