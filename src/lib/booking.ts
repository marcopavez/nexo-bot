import type { BookingRequest, Bot } from './types';

interface BookingDetails {
  customerName: string | null;
  requestedService: string | null;
  requestedDateText: string | null;
  requestedTimeText: string | null;
}

interface BookingFlowResult {
  reply: string;
  updates: Partial<BookingRequest>;
  shouldNotifyOwner: boolean;
}

const DATE_HINTS = [
  'hoy',
  'mañana',
  'manana',
  'lunes',
  'martes',
  'miercoles',
  'miércoles',
  'jueves',
  'viernes',
  'sabado',
  'sábado',
  'domingo',
];

const CORRECTION_KEYWORDS = [
  'cambiar',
  'cambio',
  'modificar',
  'en realidad',
  'mejor el',
  'mejor la',
  'mejor a las',
  'corregir',
  'otra fecha',
  'otro dia',
  'otro día',
  'otro horario',
  'otra hora',
];

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

function isCorrection(text: string): boolean {
  const normalized = normalizeText(text);
  return CORRECTION_KEYWORDS.some((kw) => normalized.includes(kw));
}

function mergeField<T>(
  existing: T | null | undefined,
  extracted: T | null,
  correction: boolean
): T | null {
  if (correction && extracted != null) return extracted;
  return existing ?? extracted ?? null;
}

function extractName(text: string): string | null {
  // Formal introductions: "me llamo X", "soy X", "mi nombre es X"
  const formalMatch = text.match(
    /\b(?:me llamo|mi nombre es|mi nombre:|nombre:)\s+([a-záéíóúüñ]+(?:\s+[a-záéíóúüñ]+){0,2})/i
  );
  if (formalMatch) return formalMatch[1].trim();

  // "soy X" — common but also used in "soy de..." so require a proper name (capitalized or short)
  const soyMatch = text.match(/\bsoy\s+([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+)?)\b/);
  if (soyMatch) return soyMatch[1].trim();

  // Standalone name at start/end of short message: "Hola! Claudia González"
  const standaloneMatch = text.match(
    /^(?:hola[,!.]?\s+)?([A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+(?:\s+[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+){0,2})[,!.]?\s*$/
  );
  if (standaloneMatch) return standaloneMatch[1].trim();

  return null;
}

function extractDateText(text: string): string | null {
  const dateHint = DATE_HINTS.find((hint) => normalizeText(text).includes(hint));
  if (dateHint) return dateHint;

  const numericDate = text.match(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/);
  return numericDate?.[0] ?? null;
}

function extractTimeText(text: string): string | null {
  const timeMatch = text.match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm|hrs?|horas?)?\b/i);
  return timeMatch?.[0]?.trim() ?? null;
}

function extractRequestedService(text: string, bot: Bot): string | null {
  const normalized = normalizeText(text);

  // Exact substring match (case-insensitive)
  const exact = bot.services?.find((item) => normalized.includes(item.nombre.toLowerCase()));
  if (exact) return exact.nombre;

  // Fuzzy: any significant word (>3 chars) from the service name appears in the message
  const fuzzy = bot.services?.find((item) => {
    const words = item.nombre.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return words.length > 0 && words.some((w) => normalized.includes(w));
  });
  return fuzzy?.nombre ?? null;
}

export function extractBookingDetails(text: string, bot: Bot): BookingDetails {
  return {
    customerName: extractName(text),
    requestedService: extractRequestedService(text, bot),
    requestedDateText: extractDateText(text),
    requestedTimeText: extractTimeText(text),
  };
}

function buildMissingFieldQuestion(missingField: keyof BookingDetails, bot: Bot): string {
  switch (missingField) {
    case 'customerName':
      return 'Para agendar, me dices tu nombre por favor?';
    case 'requestedService':
      return 'Que servicio necesitas agendar?';
    case 'requestedDateText':
      return `Perfecto. Que dia te acomoda? Nuestro horario actual es ${bot.hours ?? 'el publicado por el negocio'}.`;
    case 'requestedTimeText':
      return 'Y que horario te acomoda? Si quieres, dime una hora aproximada.';
    default:
      return 'Cuéntame un poco más para ayudarte con la agenda.';
  }
}

export function runBookingFlow(params: {
  bot: Bot;
  existingBooking: BookingRequest | null;
  userText: string;
}): BookingFlowResult {
  const { bot, existingBooking, userText } = params;
  const extracted = extractBookingDetails(userText, bot);
  const correction = existingBooking != null && isCorrection(userText);

  const merged = {
    customer_name: mergeField(existingBooking?.customer_name, extracted.customerName, correction),
    requested_service: mergeField(existingBooking?.requested_service, extracted.requestedService, correction),
    requested_date_text: mergeField(existingBooking?.requested_date_text, extracted.requestedDateText, correction),
    requested_time_text: mergeField(existingBooking?.requested_time_text, extracted.requestedTimeText, correction),
    notes: existingBooking?.notes ?? userText,
  };

  const missingFields: Array<keyof BookingDetails> = [];
  if (!merged.customer_name) missingFields.push('customerName');
  if (!merged.requested_service) missingFields.push('requestedService');
  if (!merged.requested_date_text) missingFields.push('requestedDateText');
  if (!merged.requested_time_text) missingFields.push('requestedTimeText');

  if (missingFields.length > 0) {
    return {
      reply: buildMissingFieldQuestion(missingFields[0], bot),
      updates: {
        customer_name: merged.customer_name,
        requested_service: merged.requested_service,
        requested_date_text: merged.requested_date_text,
        requested_time_text: merged.requested_time_text,
        notes: existingBooking?.notes
          ? `${existingBooking.notes}\n${userText}`
          : userText,
        status: 'collecting',
      },
      shouldNotifyOwner: false,
    };
  }

  return {
    reply:
      `Listo, ya dejé tu solicitud de agendamiento para ${merged.requested_service}. ` +
      `Te contactarán para confirmar el horario ${merged.requested_date_text} a las ${merged.requested_time_text}.`,
    updates: {
      customer_name: merged.customer_name,
      requested_service: merged.requested_service,
      requested_date_text: merged.requested_date_text,
      requested_time_text: merged.requested_time_text,
      notes: existingBooking?.notes
        ? `${existingBooking.notes}\n${userText}`
        : userText,
      status: 'pending_confirmation',
    },
    shouldNotifyOwner: true,
  };
}
