import { JsonObject, JsonPrimitive } from '../../../common/types/json-value';
import { MessageType } from './message.enums';

interface OutboundMessageBase {
  readonly recipient: string;
  readonly metadata?: JsonObject;
}

export interface TextOutboundMessage extends OutboundMessageBase {
  readonly messageType: MessageType.TEXT;
  readonly text: string;
}

export interface TemplateOutboundMessage extends OutboundMessageBase {
  readonly messageType: MessageType.TEMPLATE;
  readonly text?: string;
  readonly templateId: string;
  readonly templateVariables?: Readonly<Record<string, JsonPrimitive>>;
}

export type OutboundMessage = TextOutboundMessage | TemplateOutboundMessage;
