/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IConnectionProfile } from 'sql/parts/connection/common/interfaces';

import * as types from 'vs/base/common/types';
import { TPromise } from 'vs/base/common/winjs.base';
import * as platform from 'vs/platform/registry/common/platform';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { Action } from 'vs/base/common/actions';
import { IConstructorSignature3, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import * as nls from 'vs/nls';
import { ILocalizedString, IMenuItem, MenuRegistry, ICommandAction } from 'vs/platform/actions/common/actions';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { LinkedList } from 'vs/base/common/linkedList';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { createCSSRule } from 'vs/base/browser/dom';
import URI from 'vs/base/common/uri';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

export interface ITaskOptions {
	id: string;
	title: string;
	iconPath: { dark: string; light: string; };
	description?: ITaskHandlerDescription;
	iconClass?: string;
}

export abstract class Task {
	public readonly id: string;
	public readonly title: string;
	public readonly iconPathDark: string;
	public readonly iconPath: { dark: string; light: string; };
	private readonly _iconClass: string;
	private readonly _description: ITaskHandlerDescription;

	constructor(opts: ITaskOptions) {
		this.id = opts.id;
		this.title = opts.title;
		this.iconPath = opts.iconPath;
		this._iconClass = opts.iconClass;
		this._description = opts.description;
	}

	private toITask(): ITask {
		return {
			id: this.id,
			handler: (accessor, profile, args) => this.runTask(accessor, profile, args),
			description: this._description,
			iconClass: this._iconClass,
			iconPath: this.iconPath,
			title: this.title
		};
	}

	private toCommandAction(): ICommandAction {
		return {
			iconPath: this.iconPath,
			id: this.id,
			title: this.title
		};
	}

	public registerTask(showInCommandPalette: boolean = true): IDisposable {
		if (showInCommandPalette) {
			MenuRegistry.addCommand(this.toCommandAction());
		}
		return TaskRegistry.registerTask(this.toITask());
	}

	public abstract runTask(accessor: ServicesAccessor, profile: IConnectionProfile, args: any): void | TPromise<void>;
}

export interface ITaskHandlerDescription {
	description: string;
	args: { name: string; description?: string; constraint?: types.TypeConstraint; }[];
	returns?: string;
}

export interface ITaskEvent {
	taskId: string;
}

export interface ITaskAction {
	id: string;
	title: string | ILocalizedString;
	category?: string | ILocalizedString;
	iconClass?: string;
	iconPath?: string;
}

export interface ITaskHandler {
	(accessor: ServicesAccessor, profile: IConnectionProfile, ...args: any[]): void;
}

export interface ITask {
	id: string;
	handler: ITaskHandler;
	precondition?: ContextKeyExpr;
	description?: ITaskHandlerDescription;
	iconClass?: string;
	iconPath?: { dark: string; light?: string; };
	title?: string;
}

export interface ITaskRegistry {
	registerTask(id: string, command: ITaskHandler): IDisposable;
	registerTask(command: ITask): IDisposable;
	getTasks(): string[];
	getOrCreateTaskIconClassName(item: ICommandAction): string;
	onTaskRegistered: Event<string>;
	getCommandActionById(id: string): ICommandAction;
}

const ids = new IdGenerator('task-icon-');

export const TaskRegistry: ITaskRegistry = new class implements ITaskRegistry {

	private _tasks = new Array<string>();
	private _onTaskRegistered = new Emitter<string>();
	public readonly onTaskRegistered: Event<string> = this._onTaskRegistered.event;
	private taskIdToIconClassNameMap: Map<string /* task id */, string /* CSS rule */> = new Map<string, string>();
	private taskIdToCommandActionMap: Map<string, ICommandAction> = new Map<string, ICommandAction>();

	registerTask(idOrTask: string | ITask, handler?: ITaskHandler): IDisposable {
		let disposable: IDisposable;
		let id: string;
		if (types.isString(idOrTask)) {
			disposable = CommandsRegistry.registerCommand(idOrTask, handler);
			id = idOrTask;
		} else {
			if (idOrTask.iconClass) {
				this.taskIdToIconClassNameMap.set(idOrTask.id, idOrTask.iconClass);
			}
			if (idOrTask.iconPath && idOrTask.title) {
				this.taskIdToCommandActionMap.set(idOrTask.id, {
					iconPath: idOrTask.iconPath,
					id: idOrTask.id,
					title: idOrTask.title
				});
			}
			disposable = CommandsRegistry.registerCommand(idOrTask);
			id = idOrTask.id;
		}

		this._tasks.push(id);
		this._onTaskRegistered.fire(id);

		return {
			dispose: () => {
				let index = this._tasks.indexOf(id);
				if (index >= 0) {
					this._tasks = this._tasks.splice(index, 1);
				}
				disposable.dispose();
			}
		};
	}

	getOrCreateTaskIconClassName(item: ICommandAction): string {
		let iconClass = null;
		if (this.taskIdToIconClassNameMap.has(item.id)) {
			iconClass = this.taskIdToIconClassNameMap.get(item.id);
		} else if (item.iconPath) {
			iconClass = ids.nextId();
			createCSSRule(`.icon.${iconClass}`, `background-image: url("${URI.file(item.iconPath.light || item.iconPath.dark).toString()}")`);
			createCSSRule(`.vs-dark .icon.${iconClass}, .hc-black .icon.${iconClass}`, `background-image: url("${URI.file(item.iconPath.dark).toString()}")`);
			this.taskIdToIconClassNameMap.set(item.id, iconClass);
		}
		return iconClass;
	}

	getTasks(): string[] {
		return this._tasks.slice(0);
	}

	getCommandActionById(taskId: string): ICommandAction {
		return this.taskIdToCommandActionMap.get(taskId);
	}
};
