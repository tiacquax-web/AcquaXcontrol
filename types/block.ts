import { Block } from "@prisma/client";


export interface BlockWithComplex extends Block {
  complex?: {
    id: string;
    socialName: string;
  };
}