"""Merchant-owned PostgreSQL storage; never reads or writes Niu ledger tables."""
from contextlib import contextmanager


class Result:
    def __init__(self, cursor, lastrowid=None):
        self.cursor, self.lastrowid = cursor, lastrowid
    def fetchone(self): return self.cursor.fetchone()
    def fetchall(self): return self.cursor.fetchall()


class Postgres:
    def __init__(self, url):
        import psycopg
        from psycopg.rows import dict_row
        self.connection = psycopg.connect(url, autocommit=True, row_factory=dict_row)
        self.connection.execute('CREATE SCHEMA IF NOT EXISTS mock_payments')
        self.connection.execute('SET search_path TO mock_payments')
        self.transactions = []
    def execute(self, statement, parameters=()):
        statement = statement.replace('?', '%s').replace('ORDER BY rowid', 'ORDER BY sent,delivery')
        if statement.startswith('INSERT OR IGNORE'):
            statement = statement.replace('INSERT OR IGNORE', 'INSERT') + ' ON CONFLICT DO NOTHING'
        generated = statement.startswith('INSERT INTO deliveries(')
        if generated: statement += ' RETURNING id'
        cursor = self.connection.execute(statement, parameters)
        return Result(cursor, cursor.fetchone()['id'] if generated else None)
    def executescript(self, script):
        for statement in script.split(';'):
            statement = statement.strip()
            if not statement or statement.startswith('PRAGMA'): continue
            statement = statement.replace('id INTEGER PRIMARY KEY, session', 'id BIGSERIAL PRIMARY KEY, session')
            statement = statement.replace(' REAL', ' DOUBLE PRECISION')
            self.execute(statement)
    def __enter__(self):
        transaction = self.connection.transaction()
        transaction.__enter__()
        self.transactions.append(transaction)
        # Serialize mutations across overlapping deployment instances as well as threads.
        self.connection.execute('SELECT pg_advisory_xact_lock(186917813, 1)')
        return self
    def __exit__(self, *args): return self.transactions.pop().__exit__(*args)
    def commit(self): pass  # autocommit outside explicit transaction contexts
    def close(self): self.connection.close()
