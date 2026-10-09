ALTER TABLE payment_gateway_configuration_events ADD COLUMN actor_operator_id UUID REFERENCES admin_operators(id);
