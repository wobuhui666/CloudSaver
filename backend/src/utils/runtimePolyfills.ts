import { Blob, File as BufferFile } from "buffer";

type RuntimeBlobPart = ConstructorParameters<typeof Blob>[0][number];
type RuntimeFileOptions = {
  endings?: "transparent" | "native";
  lastModified?: number;
  type?: string;
};

declare global {
  // 兼容 Node 18 缺失的 File 全局对象
  // eslint-disable-next-line no-var
  var File:
    | typeof BufferFile
    | (new (
        fileBits: RuntimeBlobPart[],
        fileName: string,
        options?: RuntimeFileOptions
      ) => {
        readonly lastModified: number;
        readonly name: string;
      });
}

if (typeof globalThis.Blob === "undefined") {
  globalThis.Blob = Blob;
}

if (typeof globalThis.File === "undefined") {
  if (typeof BufferFile !== "undefined") {
    globalThis.File = BufferFile as typeof globalThis.File;
  } else {
    class NodeCompatibleFile extends Blob {
      public readonly lastModified: number;
      public readonly name: string;

      constructor(fileBits: RuntimeBlobPart[], fileName: string, options: RuntimeFileOptions = {}) {
        super(fileBits, options);
        this.name = String(fileName);
        this.lastModified = options.lastModified ?? Date.now();
      }

      get [Symbol.toStringTag](): string {
        return "File";
      }
    }

    globalThis.File = NodeCompatibleFile as typeof globalThis.File;
  }
}

export {};
