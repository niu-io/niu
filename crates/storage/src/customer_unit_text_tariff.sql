SELECT jsonb_build_object('revision',revision::text,'definition_revision',definition_revision::text,
    'model_alias',model_alias,'price',price)
FROM customer_unit_text_tariffs WHERE model_alias=$1 ORDER BY revision DESC LIMIT 1;
