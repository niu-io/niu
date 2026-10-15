SELECT h.model_alias,h.currency,h.version,h.current_revision,s.schedule
FROM platform_retail_price_heads h
JOIN platform_retail_standard_revisions s ON s.id=h.current_revision
WHERE h.id=$1
