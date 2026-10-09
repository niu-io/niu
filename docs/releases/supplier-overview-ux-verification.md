# Supplier overview UX review

October 7, 2026. OpenRouter’s current workspace overview was inspected as the reference for summary content linked to dedicated management sections. Niu retains its Supplier shell and theme.

The installation Supplier overview no longer repeats the complete text-price table or omits media offers from its summary. It shows backend-derived text, media and active/routable offer counts with a Supplier-scoped Models & pricing link. Detailed pricing, category tabs, filtering and offer actions remain in Models & pricing. Qualification and payables remain in Overview. No offers, rates or qualification state changed.

The real populated overview was inspected at desktop and in a 390px-wide embedded product viewport. Counts wrap vertically on narrow screens and the pricing link fits. Dashboard type checking and all six Supplier administration qualification integration tests passed. Populated media offers, every permission role and all Supplier workflows remain outside this qualification.

A subsequent integration regression supplies a media-only offer to Overview, verifies text/media/active counts and absence of the duplicated rate table, then follows the Supplier-scoped link into the existing pricing tabs. All seven Supplier administration integration tests pass. This fixture proves media offers are counted without passing their null text-rate fields to money formatting.
