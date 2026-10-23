import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError
from service import Merchant

class MerchantTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name)/'merchant.db'
        self.args = (self.path,'http://127.0.0.1:2570','http://127.0.0.1:2567/payments/stripe/notify','http://127.0.0.1:2566/settings/payments','sk_test_'+'a'*32,'whsec_'+'b'*32)
        self.merchant = Merchant(*self.args)
        self.form = {k:[v] for k,v in {'mode':'payment','client_reference_id':'a'*32,'line_items[0][price_data][unit_amount]':'1234','line_items[0][price_data][currency]':'usd','line_items[0][quantity]':'1','payment_method_types[0]':'card'}.items()}
    def tearDown(self):
        self.merchant.db.close(); self.directory.cleanup()
    def test_restart_and_conflicting_retry(self):
        first=self.merchant.create(self.form,'intent')
        self.merchant.db.close(); self.merchant=Merchant(*self.args)
        self.assertEqual(first,self.merchant.create(self.form,'intent'))
        with self.assertRaises(ValueError): self.merchant.create(dict(self.form,mode=['subscription']),'intent')
        changed=dict(self.form); changed['line_items[0][price_data][unit_amount]']=['2000']
        with self.assertRaises(ValueError): self.merchant.create(changed,'intent')
    def test_disabled_selection_survives_restart(self):
        with self.merchant.db:
            self.merchant.db.execute("UPDATE settings SET value='false' WHERE key='enabled'")
        self.merchant.db.close(); self.merchant=Merchant(*self.args)
        self.assertFalse(self.merchant.enabled())
        self.assertEqual(self.merchant.readiness(), 'unconfigured')
        fresh = Merchant(Path(self.directory.name)/'fresh.db', *self.args[1:], enabled=False)
        try: self.assertFalse(fresh.enabled())
        finally: fresh.db.close()
    def test_scenarios_and_replay_are_durable(self):
        for scenario in ('success','failure','cancel','timeout','delayed','duplicate','out_of_order'):
            session=self.merchant.create(self.form,scenario); token=session['id'].removeprefix('cs_test_mock_')
            first=self.merchant.decide(token,scenario)
            self.assertEqual(first,self.merchant.decide(token,scenario))
            with self.assertRaises(ValueError): self.merchant.decide(token,'failure' if scenario!='failure' else 'success')
            body=json.loads(self.merchant.db.execute('SELECT body FROM sessions WHERE token=?',(token,)).fetchone()[0])
            self.assertEqual(body['payment_status']=='paid',scenario in ('success','delayed','duplicate','out_of_order'))
            events=self.merchant.db.execute('SELECT event FROM deliveries WHERE session=? ORDER BY id',(session['id'],)).fetchall()
            self.assertEqual(len(events),0 if scenario=='timeout' else 2 if scenario in ('duplicate','out_of_order') else 1)
            if scenario=='duplicate': self.assertEqual(events[0][0],events[1][0])
            if scenario=='out_of_order': self.assertEqual(json.loads(events[-1][0])['data']['object']['payment_status'],'unpaid')
    def test_invalid_orders_never_persist(self):
        for field,value in [('mode','subscription'),('line_items[0][price_data][unit_amount]','0'),('line_items[0][price_data][currency]','eur'),('client_reference_id','foreign')]:
            form=dict(self.form);form[field]=[value]
            with self.assertRaises(ValueError): self.merchant.create(form,field)
        self.assertEqual(self.merchant.db.execute('SELECT count(*) FROM sessions').fetchone()[0],0)

    def test_failed_delivery_history_and_idempotent_manual_recovery(self):
        session = self.merchant.create(self.form, 'retry')
        token = session['id'].removeprefix('cs_test_mock_')
        self.merchant.decide(token, 'success')
        with self.assertRaises(ValueError): self.merchant.retry(token, 1)
        with patch('service.build_opener') as opener:
            opener.return_value.open.side_effect = URLError('offline')
            for _ in range(8):
                with self.merchant.db: self.merchant.db.execute('UPDATE deliveries SET due=0')
                self.assertTrue(self.merchant.deliver())
        failed = self.merchant.view(token)['deliveries'][0]
        self.assertTrue(failed['retry_allowed'])
        self.assertEqual(len(failed['history']), 8)
        self.assertEqual(failed['last_status'], 0)
        self.merchant.retry(token, 1)
        self.merchant.retry(token, 1)
        events = self.merchant.db.execute('SELECT event FROM deliveries ORDER BY id').fetchall()
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0][0], events[1][0])
        self.merchant.db.close(); self.merchant = Merchant(*self.args)
        self.assertEqual(len(self.merchant.view(token)['deliveries'][0]['history']), 8)
        self.assertTrue(self.merchant.view(token)['deliveries'][0]['retried'])
        with patch('service.build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.status = 200
            self.assertTrue(self.merchant.deliver())
        recovered = self.merchant.view(token)['deliveries'][1]
        self.assertEqual(recovered['history'][0]['status'], 200)
        self.assertTrue(recovered['delivered'])
        with self.assertRaises(ValueError): self.merchant.retry(token, 2)
        with self.assertRaises(KeyError): self.merchant.retry('foreign', 1)

if __name__=='__main__': unittest.main()
