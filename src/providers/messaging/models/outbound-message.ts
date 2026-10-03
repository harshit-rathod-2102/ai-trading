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

export interface InteractiveButton {
  readonly id: string;
  readonly title: string;
}

export interface InteractiveOutboundMessage extends OutboundMessageBase {
  readonly messageType: MessageType.INTERACTIVE;
  readonly body: string;
  readonly buttons: readonly InteractiveButton[];
  readonly footer?: string;
}

export type OutboundMessage =
  TextOutboundMessage | TemplateOutboundMessage | InteractiveOutboundMessage;
