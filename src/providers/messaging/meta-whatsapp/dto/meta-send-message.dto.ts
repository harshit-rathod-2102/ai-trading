export interface MetaTextMessageDto {
  readonly messaging_product: 'whatsapp';
  readonly recipient_type: 'individual';
  readonly to: string;
  readonly type: 'text';
  readonly text: { readonly preview_url: false; readonly body: string };
}

export interface MetaTemplateMessageDto {
  readonly messaging_product: 'whatsapp';
  readonly recipient_type: 'individual';
  readonly to: string;
  readonly type: 'template';
  readonly template: {
    readonly name: string;
    readonly language: { readonly code: string };
    readonly components?: readonly [
      {
        readonly type: 'body';
        readonly parameters: readonly { readonly type: 'text'; readonly text: string }[];
      },
    ];
  };
}

export interface MetaInteractiveMessageDto {
  readonly messaging_product: 'whatsapp';
  readonly recipient_type: 'individual';
  readonly to: string;
  readonly type: 'interactive';
  readonly interactive: {
    readonly type: 'button';
    readonly body: { readonly text: string };
    readonly action: {
      readonly buttons: readonly {
        readonly type: 'reply';
        readonly reply: { readonly id: string; readonly title: string };
      }[];
    };
    readonly footer?: { readonly text: string };
  };
}

export type MetaSendMessageDto =
  MetaTextMessageDto | MetaTemplateMessageDto | MetaInteractiveMessageDto;
