declare module "saxon-js" {
  export interface TransformOptions {
    stylesheetInternal?: unknown;
    stylesheetText?: string;
    sourceText?: string;
    sourceNode?: unknown;
    destination?: "serialized" | "document" | "application" | "raw" | "stdout" | "file";
    stylesheetParams?: Record<string, unknown>;
  }
  export interface TransformResult {
    principalResult: unknown;
  }
  const SaxonJS: {
    transform(options: TransformOptions, execution: "async"): Promise<TransformResult>;
    transform(options: TransformOptions, execution?: "sync"): TransformResult;
  };
  export default SaxonJS;
}
