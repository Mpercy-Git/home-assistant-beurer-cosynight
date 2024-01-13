import dataclasses
import datetime
import json
import logging
import os
import requests


_BASE_URL = 'https://cosynight.azurewebsites.net'
_DATETIME_FORMAT = '%a, %d %b %Y %H:%M:%S %Z'


@dataclasses.dataclass
class Device:
    active: bool
    id: str
    name: str
    requiresUpdate: bool


@dataclasses.dataclass
class Quickstart:
    bodySetting: int
    feetSetting: int
    id: str
    timespan: int  # Seconds


@dataclasses.dataclass
class Status:
    active: bool
    bodySetting: int
    feetSetting: int
    heartbeat: int
    id: str
    name: str
    requiresUpdate: bool
    timer: int


@dataclasses.dataclass
class _Token:
    access_token: str
    expires: str
    expires_in: int
    issued: str
    refresh_token: str
    token_type: str
    user_email: str
    user_id: str


class _TokenAuth(requests.auth.AuthBase):

    def __init__(self, token):
        self._token = token

    def __call__(self, request):
        request.headers['Authorization'] = (
                f'{self._token.token_type} {self._token.access_token}')
        return request


class BeurerCosyNight:

    class Error(Exception):
        pass

    def __init__(self):
        self._token = None
        if os.path.exists('token'):
            with open('token') as f:
                self._token = _Token(**json.load(f))

    def _update_token(self, response):
        body = response.json()
        body['expires'] = body.pop('.expires')
        body['issued'] = body.pop('.issued')
        self._token = _Token(**body)
        with open('token', 'w') as f:
            json.dump(dataclasses.asdict(self._token), f)
        logging.info('Token updated.')

    def _refresh_token(self):
        if self._token is None:
            raise Error('Not authenticated')

        expires = datetime.datetime.strptime(self._token.expires, _DATETIME_FORMAT)
        expires = expires.replace(tzinfo=datetime.timezone.utc)
        if datetime.datetime.now(datetime.timezone.utc) > expires:
            logging.info('Refreshing token...')
            r = requests.post(_BASE_URL + '/token',
                              data={
                                  'grant_type': 'refresh_token',
                                  'refresh_token': self._token.refresh_token 
                              })
            if r.status_code == requests.codes.ok:
                self._update_token(r)
            else:
                self._token = None
                r.raise_for_status()

    def authenticate(self, username, password):
        if self._token is None:
            logging.info('Requesting new token...')
            r = requests.post(_BASE_URL + '/token',
                              data={
                                  'grant_type': 'password',
                                  'username': username,
                                  'password': password
                              })
            r.raise_for_status()
            self._update_token(r)

    def get_status(self, id):
        self._refresh_token()
        logging.info('Getting device status...')
        r = requests.post(_BASE_URL + '/api/v1/Device/GetStatus',
                          json={'id': id},
                          auth=_TokenAuth(self._token))
        r.raise_for_status()
        body = r.json()
        body['requiresUpdate'] = body.pop('requieresUpdate')
        return Status(**body)
 
    def list_devices(self):
        self._refresh_token()
        logging.info('Listing devices...')
        r = requests.get(_BASE_URL + '/api/v1/Device/List', auth=_TokenAuth(self._token))
        r.raise_for_status()
        ds = []
        for d in r.json()['devices']:
            d['requiresUpdate'] = d.pop('requieresUpdate')
            ds.append(Device(**d))
        return ds
 
    def quickstart(self, quickstart):
        self._refresh_token()
        logging.info('Quick starting device...')
        r = requests.post(_BASE_URL + '/api/v1/Device/Quickstart',
                          json=dataclasses.asdict(quickstart),
                          auth=_TokenAuth(self._token))
        r.raise_for_status()

