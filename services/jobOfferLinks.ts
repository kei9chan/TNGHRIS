import type { Offer } from '../types';

export const candidateOfferUrl = (offer: Pick<Offer, 'secureToken'>, origin = window.location.origin) =>
  offer.secureToken ? `${origin}/offer/${offer.secureToken}` : '';
