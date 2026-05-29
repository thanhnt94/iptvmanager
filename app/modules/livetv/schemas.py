from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TVProgramBase(BaseModel):
    title: str
    video_url: str
    is_live_stream: bool = False
    duration_seconds: int = 3600
    order_index: int = 0
    start_time: Optional[datetime] = None

class TVProgramCreate(TVProgramBase):
    channel_id: int

class TVProgramResponse(TVProgramBase):
    id: int
    channel_id: int
    created_at: datetime
    class Config:
        orm_mode = True

class TVChannelBase(BaseModel):
    name: str
    slug: str
    logo: Optional[str] = None
    description: Optional[str] = None
    type: str = 'loop'
    is_active: bool = True

class TVChannelCreate(TVChannelBase):
    pass

class TVChannelResponse(TVChannelBase):
    id: int
    epoch_time: datetime
    created_at: datetime
    programs: List[TVProgramResponse] = []
    class Config:
        orm_mode = True

class TVCurrentProgramResponse(BaseModel):
    channel_id: int
    channel_name: str
    channel_type: str
    program: Optional[TVProgramResponse] = None
    seek_time: float = 0 # Offset in seconds to start playing
    upcoming: List[TVProgramResponse] = []
