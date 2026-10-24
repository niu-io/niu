#!/usr/bin/env python3
"""Compatibility launcher for the built-in mock payment plugin."""
from pathlib import Path
import runpy
import sys
plugin = Path(__file__).resolve().parents[2] / 'plugins/mock-payments'
sys.path.insert(0, str(plugin))
globals().update({k: v for k, v in runpy.run_path(str(plugin / 'service.py')).items() if not k.startswith('__')})
if __name__ == '__main__':
    main()
