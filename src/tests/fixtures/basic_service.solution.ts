export interface IMyServicePingArgsArgs {
}
export class MyServicePingArgs {
    constructor(args?: IMyServicePingArgsArgs) {
        if (args != null) {
        }
    }
    public write(output: TProtocol): void {
        output.writeStructBegin("MyServicePingArgs");
        output.writeFieldStop();
        output.writeStructEnd();
        return;
    }
    public read(input: TProtocol): void {
        input.readStructBegin();
        while (true) {
            const ret: {
                fname: string;
                ftype: Thrift.Type;
                fid: number;
            } = input.readFieldBegin();
            const ftype: Thrift.Type = ret.ftype;
            const fid: number = ret.fid;
            if (ftype === Thrift.Type.STOP) {
                break;
            }
            switch (fid) {
                default: {
                    input.skip(ftype);
                }
            }
            input.readFieldEnd();
        }
        input.readStructEnd();
        return;
    }
}
export interface IMyServicePingResultArgs {
    success?: void;
}
export class MyServicePingResult {
    public success: void;
    constructor(args?: IMyServicePingResultArgs) {
        if (args != null) {
            if (args.success != null) {
                this.success = args.success;
            }
        }
    }
    public write(output: TProtocol): void {
        output.writeStructBegin("MyServicePingResult");
        output.writeFieldStop();
        output.writeStructEnd();
        return;
    }
    public read(input: TProtocol): void {
        input.readStructBegin();
        while (true) {
            const ret: {
                fname: string;
                ftype: Thrift.Type;
                fid: number;
            } = input.readFieldBegin();
            const ftype: Thrift.Type = ret.ftype;
            const fid: number = ret.fid;
            if (ftype === Thrift.Type.STOP) {
                break;
            }
            switch (fid) {
                case 0:
                    if (ftype === Thrift.Type.VOID) {
                        input.skip(ftype);
                    }
                    else {
                        input.skip(ftype);
                    }
                    break;
                default: {
                    input.skip(ftype);
                }
            }
            input.readFieldEnd();
        }
        input.readStructEnd();
        return;
    }
}
export class Client {
    private _seqid: number;
    private _reqs: {
        [name: number]: (err: Error | object | undefined, val?: any) => void;
    };
    public output: TTransport;
    public protocol: new (trans: TTransport) => TProtocol;
    constructor(output: TTransport, protocol: new (trans: TTransport) => TProtocol) {
        this._seqid = 0;
        this._reqs = {};
        this.output = output;
        this.protocol = protocol;
    }
    public seqid(): number {
        return this._seqid;
    }
    public new_seqid(): number {
        return this._seqid += 1;
    }
    public ping(): Promise<void> {
        this._seqid = this.new_seqid();
        return new Promise<void>((resolve, reject): void => {
            this._reqs[this.seqid()] = (error, result) => {
                if (error != null) {
                    reject(error);
                }
                else {
                    resolve(result);
                }
            };
            this.send_ping();
        });
    }
    public send_ping(): void {
        const output = new this.protocol(this.output);
        output.writeMessageBegin("ping", Thrift.MessageType.CALL, this.seqid());
        const args = new MyServicePingArgs({});
        args.write(output);
        output.writeMessageEnd();
        return this.output.flush();
    }
    public recv_ping(input: TProtocol, mtype: Thrift.MessageType, rseqid: number): void {
        const noop = (): any => null;
        const callback = this._reqs[rseqid] || noop;
        delete this._reqs[rseqid];
        if (mtype === Thrift.MessageType.EXCEPTION) {
            const x: Thrift.TApplicationException = new Thrift.TApplicationException();
            x.read(input);
            input.readMessageEnd();
            return callback(x);
        }
        const result = new MyServicePingResult();
        result.read(input);
        input.readMessageEnd();
        if (false) {
            if (result.success != null) {
                return callback(undefined, result.success);
            }
        }
        return callback(new Thrift.TApplicationException(Thrift.TApplicationExceptionType.UNKNOWN, "ping failed: unknown result"));
    }
}
export interface IMyServiceHandler<Context> {
    ping: (context: Context) => void;
}
export class Processor<Context> {
    private _handler: IMyServiceHandler<Context>;
    constructor(handler: IMyServiceHandler<Context>) {
        this._handler = handler;
    }
    public process(input: TProtocol, output: TProtocol, context: Context): void {
        const metadata: {
            fname: string;
            mtype: Thrift.MessageType;
            rseqid: number;
        } = input.readMessageBegin();
        const fname: string = metadata.fname;
        const rseqid: number = metadata.rseqid;
        const methodName: string = "process_" + fname;
        switch (methodName) {
            case "process_ping": {
                return this.process_ping(rseqid, input, output, context);
            }
            default: {
                input.skip(Thrift.Type.STRUCT);
                input.readMessageEnd();
                const errMessage = "Unknown function " + fname;
                const err = new Thrift.TApplicationException(Thrift.TApplicationExceptionType.UNKNOWN_METHOD, errMessage);
                output.writeMessageBegin(fname, Thrift.MessageType.EXCEPTION, rseqid);
                err.write(output);
                output.writeMessageEnd();
                output.flush();
            }
        }
    }
    public process_ping(seqid: number, input: TProtocol, output: TProtocol, context: Context): void {
        const args = new MyServicePingArgs();
        args.read(input);
        input.readMessageEnd();
        new Promise<void>((resolve, reject): void => {
            try {
                resolve(this._handler.ping(context));
            }
            catch (err) {
                reject(err);
            }
        }).then((data: void): void => {
            const result = new MyServicePingResult({ success: data });
            output.writeMessageBegin("ping", Thrift.MessageType.REPLY, seqid);
            result.write(output);
            output.writeMessageEnd();
            output.flush();
        }).catch((err: Error): void => {
            if (0 > 0) {
            }
            else {
                const result: Thrift.TApplicationException = new Thrift.TApplicationException(Thrift.TApplicationExceptionType.UNKNOWN, err.message);
                output.writeMessageBegin("ping", Thrift.MessageType.EXCEPTION, seqid);
                result.write(output);
                output.writeMessageEnd();
                output.flush();
                return;
            }
        });
    }
}
