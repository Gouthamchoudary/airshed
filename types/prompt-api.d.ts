type PromptOptions = {
  expectedInputs: Array<{ type: 'text'; languages: string[] }>;
  expectedOutputs: Array<{ type: 'text'; languages: string[] }>;
};

interface LocalPromptSession {
  prompt(text: string, options: { signal: AbortSignal }): Promise<string>;
  destroy(): void;
}

declare var LanguageModel:
  | {
      availability(options: PromptOptions): Promise<string>;
      create(
        options: PromptOptions & {
          signal: AbortSignal;
          initialPrompts: Array<{ role: 'system'; content: string }>;
        },
      ): Promise<LocalPromptSession>;
    }
  | undefined;
