import type { IntentDetection } from './types';

const BOOKING_KEYWORDS = [
  'agendar',
  'agenda',
  'reservar',
  'reserva',
  'hora',
  'cita',
  'disponibilidad',
];

const QUOTE_KEYWORDS = [
  'cotizacion',
  'cotización',
  'presupuesto',
  'cotizar',
  'valor',
];

const HANDOFF_KEYWORDS = [
  'humano',
  'persona',
  'asesor',
  'ejecutivo',
  'agente',
  'operador',
  'reclamo',
  'reclamar',
  'problema',
  'molesto',
];

const LEAD_KEYWORDS = [
  'me interesa',
  'quiero',
  'necesito',
  'comprar',
  'contratar',
  'informacion',
  'información',
];

function includesKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function detectIntent(message: string): IntentDetection {
  const normalized = message.trim().toLowerCase();

  if (includesKeyword(normalized, HANDOFF_KEYWORDS)) {
    return {
      intent: 'handoff',
      confidence: 'high',
      reason: 'El mensaje pide ayuda humana o expresa un reclamo/problema.',
    };
  }

  if (includesKeyword(normalized, BOOKING_KEYWORDS)) {
    return {
      intent: 'booking',
      confidence: 'high',
      reason: 'El mensaje contiene vocabulario directo de reserva o agendamiento.',
    };
  }

  if (includesKeyword(normalized, QUOTE_KEYWORDS)) {
    return {
      intent: 'quote',
      confidence: 'high',
      reason: 'El mensaje contiene términos directos de cotización o presupuesto.',
    };
  }

  if (includesKeyword(normalized, LEAD_KEYWORDS)) {
    return {
      intent: 'lead',
      confidence: 'medium',
      reason: 'El mensaje expresa intención comercial pero aún puede requerir calificación.',
    };
  }

  return {
    intent: 'faq',
    confidence: 'low',
    reason: 'No se detectó intención comercial clara; se tratará como consulta general.',
  };
}
