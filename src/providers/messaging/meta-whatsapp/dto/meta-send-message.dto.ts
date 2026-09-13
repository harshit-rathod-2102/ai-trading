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
    readonly components?: readonly [{
      readonly type: 'body';
      readonly parameters: readonly { readonly type: 'text'; readonly text: string }[];
    }];
  };
}

export type MetaSendMessageDto = MetaTextMessageDto | MetaTemplateMessageDto;
