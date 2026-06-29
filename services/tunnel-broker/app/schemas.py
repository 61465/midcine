from pydantic import BaseModel


class TunnelRequest(BaseModel):
    consent_id: str
    source_hospital_id: str
    target_hospital_id: str
    study_uids: list[str]


class TunnelEndpoint(BaseModel):
    hospital_id: str
    public_ip: str
    port: int
    cert_pem: str
    key_pem: str
    peer_cert_fingerprint: str


class TunnelResponse(BaseModel):
    tunnel_id: str
    expires_at: str
    source: TunnelEndpoint
    target: TunnelEndpoint
    stun_server: str
