"""Native HTTP acceptance for the local packaged-video recovery upstream."""
import importlib.util
import json
import os
import secrets
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('package_video_fixture', Path(__file__).resolve().parents[2] / 'tests/fixtures/mock-openai-compatible.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

class VideoFixtureAcceptance(unittest.TestCase):
    def setUp(self):
        self.secret = secrets.token_urlsafe(24)
        self.environment = patch.dict(os.environ, {'PROVIDER_KEY': self.secret})
        self.environment.start()
        fixture.Handler.video_jobs = {}
        fixture.Handler.video_creates = fixture.Handler.video_queries = fixture.Handler.video_requests = 0
        self.server = HTTPServer(('127.0.0.1', 0), fixture.Handler)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=3)
        self.environment.stop()

    def request(self, path, body=None, token=None):
        request = urllib.request.Request(self.base + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={'Authorization': 'Bearer ' + (token or self.secret), 'Content-Type':'application/json'})
        with self.opener.open(request, timeout=3) as response:
            return json.load(response)

    def test_existing_upstream_job_advances_without_a_second_generation(self):
        job = self.request('/contents/generations/tasks', {'model':'fixture-video-model','content':[{'type':'text','text':'Package recovery fixture'}]})
        path = '/contents/generations/tasks/' + job['id']
        states = [self.request(path) for _ in range(4)]
        self.assertEqual([state['status'] for state in states], ['queued','running','succeeded','succeeded'])
        self.assertEqual(states[2], states[3])
        self.assertEqual(states[2]['usage'], {'completion_tokens':100000})
        self.assertEqual(self.request('/fixture/video-counts'), {'creates':1,'queries':4,'requests':5})

    def test_uncertain_creation_has_no_queryable_identity(self):
        result = self.request('/contents/generations/tasks', {'model':'fixture-video-model','content':[{'type':'text','text':'Package uncertain submission fixture'}]})
        self.assertNotIn('id', result)
        self.assertIn('error', result)
        self.assertEqual(fixture.Handler.video_jobs, {})
        self.assertEqual(self.request('/fixture/video-counts'), {'creates':1,'queries':0,'requests':1})

    def test_existing_text_and_stream_contracts_do_not_increment_video_counters(self):
        body = {'model':'fixture-model','messages':[{'role':'user','content':'fixture'}]}
        result = self.request('/v1/chat/completions', body)
        self.assertEqual(result['usage'], {'prompt_tokens':3,'completion_tokens':1,'total_tokens':4})
        request = urllib.request.Request(self.base + '/v1/chat/completions',
            data=json.dumps({**body,'stream':True}).encode(),
            headers={'Authorization':'Bearer ' + self.secret,'Content-Type':'application/json'})
        with self.opener.open(request, timeout=3) as response:
            self.assertEqual(response.headers.get_content_type(), 'text/event-stream')
            events = response.read().decode()
        self.assertTrue(events.endswith('data: [DONE]\n\n'))
        parsed = [json.loads(line.removeprefix('data: ')) for line in events.splitlines() if line.startswith('data: ') and line != 'data: [DONE]']
        self.assertEqual(parsed[-1]['usage'], result['usage'])
        self.assertEqual(self.request('/fixture/video-counts'), {'creates':0,'queries':0,'requests':0})

    def test_unknown_job_and_invalid_or_unauthenticated_create_do_not_dispatch(self):
        for path, body, token, status in [
            ('/contents/generations/tasks/missing', None, None, 404),
            ('/fixture/video-counts', None, 'wrong', 401),
            ('/contents/generations/tasks', {'model':'fixture-video-model','content':[]}, None, 400),
            ('/contents/generations/tasks', {'model':'fixture-video-model','content':[{'type':'image_url','image_url':'private'}]}, None, 400),
            ('/contents/generations/tasks', {'model':'wrong','content':[{'type':'text','text':'fixture'}]}, None, 400),
            ('/contents/generations/tasks', {'model':'fixture-video-model','content':[{'type':'text','text':'fixture'}]}, 'wrong', 401),
        ]:
            with self.subTest(path=path, status=status):
                with self.assertRaises(urllib.error.HTTPError) as failure:
                    self.request(path, body, token)
                self.assertEqual(failure.exception.code, status)
        self.assertEqual(self.request('/fixture/video-counts'), {'creates':0,'queries':0,'requests':5})

if __name__ == '__main__':
    unittest.main()
